import sys
import os
import traceback
import subprocess
import json
from google import genai
from google.genai import types
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

# Simplified OTel setup for the runner
from otel_setup import init_telemetry

def main():
    if len(sys.argv) < 2:
        print("Missing instruction payload", file=sys.stderr)
        sys.exit(1)
        
    instruction = sys.argv[1]
    
    # 1. Initialize API Client
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Missing GEMINI_API_KEY", file=sys.stderr)
        sys.exit(1)
        
    logger = init_telemetry("python-agent-runner")
    tracer = trace.get_tracer("python-agent-runner")
    
    with tracer.start_as_current_span("Agent:Lifecycle") as root_span:
        root_span.set_attribute("instruction", instruction)
        print(f"Starting Python agent execution for instruction: {instruction}")
        
        try:
            client = genai.Client(api_key=api_key)
            
            # 2. System Instruction
            system_instruction = (
                "You are an autonomous Python AI swarm worker inside an isolated repository worktree. "
                "You have access to bash commands, file reading, and file writing. "
                "Execute your assigned instruction and write your output to the required location. "
                "When you are completely finished, output the exact word 'DONE'. "
                "Use tools to discover codebase context before acting."
            )
            
            tools = [
                types.Tool(
                    function_declarations=[
                        types.FunctionDeclaration(
                            name="read_file",
                            description="Reads the content of a file",
                            parameters=types.Schema(
                                type="OBJECT",
                                properties={
                                    "filePath": types.Schema(type="STRING")
                                },
                                required=["filePath"]
                            )
                        ),
                        types.FunctionDeclaration(
                            name="write_file",
                            description="Writes content to a file",
                            parameters=types.Schema(
                                type="OBJECT",
                                properties={
                                    "filePath": types.Schema(type="STRING"),
                                    "content": types.Schema(type="STRING")
                                },
                                required=["filePath", "content"]
                            )
                        ),
                        types.FunctionDeclaration(
                            name="exec_command",
                            description="Executes a shell command (e.g. ls, grep, find)",
                            parameters=types.Schema(
                                type="OBJECT",
                                properties={
                                    "command": types.Schema(type="STRING")
                                },
                                required=["command"]
                            )
                        )
                    ]
                )
            ]

            chat = client.chats.create(
                model='gemini-2.5-flash',
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    tools=tools
                )
            )

            prompt = f"Execute this instruction:\n\n{instruction}\n\nUse your tools to explore and act. Say DONE when finished."

            for i in range(30):
                print(f"\n--- Iteration {i + 1} ---")
                response = chat.send_message(prompt)
                
                if response.text:
                    print(f"AGENT: {response.text}")
                    if "DONE" in response.text:
                        print("Agent finished successfully.")
                        root_span.set_status(Status(StatusCode.OK))
                        sys.exit(0)

                if not response.candidates[0].content.parts:
                    prompt = "Please continue working or output exactly 'DONE' if you are completely finished."
                    continue

                tool_calls = [part.function_call for part in response.candidates[0].content.parts if part.function_call]
                if not tool_calls:
                    prompt = "Please continue working or output exactly 'DONE' if you are completely finished."
                    continue

                tool_responses = []
                for call in tool_calls:
                    with tracer.start_as_current_span(f"Tool:{call.name}") as tool_span:
                        name = call.name
                        args = call.args
                        print(f"> CALLING TOOL: {name} with {str(args)[:100]}...")
                        tool_span.set_attribute("tool.args", json.dumps(args))
                        
                        try:
                            if name == "read_file":
                                with open(args["filePath"], "r", encoding="utf-8") as f:
                                    content = f.read()
                                print(f"> READ {args['filePath']} ({len(content)} bytes)")
                                tool_responses.append(types.Part.from_function_response(
                                    name=name,
                                    response={"content": content[:20000]}
                                ))
                            elif name == "write_file":
                                os.makedirs(os.path.dirname(args["filePath"]), exist_ok=True)
                                with open(args["filePath"], "w", encoding="utf-8") as f:
                                    f.write(args["content"])
                                print(f"> WROTE {args['filePath']}")
                                tool_responses.append(types.Part.from_function_response(
                                    name=name,
                                    response={"success": True}
                                ))
                            elif name == "exec_command":
                                try:
                                    result = subprocess.run(
                                        args["command"],
                                        shell=True,
                                        capture_output=True,
                                        text=True,
                                        timeout=60
                                    )
                                    output = result.stdout + result.stderr
                                    print(f"> EXEC {args['command']} OUTPUT:\n{output[:500]}...")
                                    tool_responses.append(types.Part.from_function_response(
                                        name=name,
                                        response={"output": output[:20000]}
                                    ))
                                except subprocess.TimeoutExpired:
                                    tool_responses.append(types.Part.from_function_response(
                                        name=name,
                                        response={"error": "Command timed out after 60s"}
                                    ))
                            tool_span.set_status(Status(StatusCode.OK))
                        except Exception as e:
                            print(f"> TOOL ERROR: {str(e)}")
                            tool_span.record_exception(e)
                            tool_span.set_status(Status(StatusCode.ERROR, str(e)))
                            tool_responses.append(types.Part.from_function_response(
                                name=name,
                                response={"error": str(e)}
                            ))

                prompt = tool_responses

            print("Max iterations reached.", file=sys.stderr)
            root_span.set_status(Status(StatusCode.ERROR, "Max iterations reached"))
            sys.exit(1)
            
        except Exception as e:
            print(f"Error in python agent loop: {e}", file=sys.stderr)
            traceback.print_exc()
            root_span.record_exception(e)
            root_span.set_status(Status(StatusCode.ERROR, str(e)))
            sys.exit(1)

if __name__ == "__main__":
    main()
