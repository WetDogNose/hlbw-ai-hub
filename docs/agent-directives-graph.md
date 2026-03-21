# Agent Directives Graph

This Mermaid diagram visualizes the strict agent directives, instructions, and hints extracted from the workspace. It illustrates how these rules originate from specific codebase files and relate to various domains, actions, and overarching concepts like OpenTelemetry standardization or port configuration. Directives, instructions, and hints are grouped by file and their core attributes (priority, domain, action, intent, execution type) are integrated into their labels for clarity, while common themes are highlighted as central concepts.

```mermaid
graph TD
    subgraph Codebase Files
        F1["templates/adk-chat-interface/server.js"]
        F2["templates/cloud-run/node/index.js"]
        F3["templates/docker/node/index.js"]
        F4["wrappers/mcp/index.js"]
        F5["wrappers/a2a/main.py"]
    end

    subgraph Agent Rules
        subgraph Directives
            D_OTel_CS("OpenTelemetry init MUST NOT be removed (CRITICAL, Security)")
            D_ExpBoiler_HL("Express/OTel boilerplate MUST NOT be modified (HIGH, Logic)")
            D_OTel_CL("OpenTelemetry init MUST NOT be removed (CRITICAL, Logic)")
            D_PortVar_HL("Port var MUST use 'process.env.PORT' (HIGH, Logic)")
            D_PortEnv_HL("PORT env var MUST ALWAYS be used (HIGH, Logic)")
            D_DomHeavy_HL("Domain-heavy logic MUST NOT be in handler (HIGH, Logic)")
            D_A2ARoute_CF("/a2a/message route signature MUST NOT be changed (CRITICAL, Format)")
        end

        subgraph Instructions
            I_ADKGenkit_Seq[[Integrate ADK/Genkit logic into chat endpoint (sequential)]]
            I_ToolReq_Seq[[Integrate tool requests with internal agent logic (sequential)]]
        end

        subgraph Hints
            H_OTelUniform_Context{{{Maintaining OTel init ensures uniformity (Context)}}}
            H_CRPort_Context{{{Default port for Cloud Run is 8080 (Context)}}}
        end
    end

    subgraph Core Concepts
        ConcOTel[("OpenTelemetry Standardization")]
        ConcPortConfig[("Standard Port Configuration")]
        ConcA2A[("A2A Interface Standard")]
    end

    %% File to Directive/Instruction/Hint links
    F1 -- "contains" --> D_OTel_CS
    F1 -- "contains" --> D_ExpBoiler_HL
    F1 -- "contains" --> I_ADKGenkit_Seq

    F2 -- "contains" --> D_OTel_CL
    F2 -- "contains" --> D_PortVar_HL
    F2 -- "contains" --> H_OTelUniform_Context
    F2 -- "contains" --> H_CRPort_Context

    F3 -- "contains" --> D_OTel_CL
    F3 -- "contains" --> D_PortEnv_HL

    F4 -- "contains" --> D_OTel_CL
    F4 -- "contains" --> D_DomHeavy_HL
    F4 -- "contains" --> I_ToolReq_Seq

    F5 -- "contains" --> D_OTel_CS
    F5 -- "contains" --> D_A2ARoute_CF

    %% Rule to Core Concept links
    D_OTel_CS -- "impacts" --> ConcOTel
    D_ExpBoiler_HL -- "impacts" --> ConcOTel
    D_OTel_CL -- "impacts" --> ConcOTel
    D_PortVar_HL -- "impacts" --> ConcPortConfig
    D_PortEnv_HL -- "impacts" --> ConcPortConfig
    D_A2ARoute_CF -- "impacts" --> ConcA2A

    H_OTelUniform_Context -- "explains" --> ConcOTel
    H_CRPort_Context -- "explains" --> ConcPortConfig
```