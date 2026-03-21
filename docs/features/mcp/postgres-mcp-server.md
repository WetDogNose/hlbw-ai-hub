# PostgreSQL MCP Server Setup

This project uses the official `@modelcontextprotocol/server-postgres` to provide the AI assistant with direct, secure, read-only access to the production `wot_box_db` database.

## 1. Safety & Architecture
Because Cloud SQL instances often require specific IPs or SSL certificates, and because the default application user (`wot_box_user`) owns the tables but we want the AI to be strictly read-only, we use a dedicated database user.

- **MCP User**: `wot-box-read-only`
- **Permissions**: `GRANT SELECT ON ALL TABLES IN SCHEMA public`
- **Connection**: To bypass local SSL restrictions during development/triage, the MCP server connects to the database.

## 2. Setting up the Configuration
To keep database credentials secure while allowing the configuration to be shared across the team, the configuration is split into two parts:

**1. The Credentials (`.env`)**
Add the connection string to your local `.env` file (which is tracked in `.gitignore`).

For standard direct connections (e.g. local databases, Supabase, Neon):
```env
MCP_DATABASE_URL="<your_postgres_connection_string_here>"
```

*(Optional)* If you are connecting to a Google Cloud SQL instance and want the MCP server to automatically start the Cloud SQL authentication proxy for you, also add:
```env
MCP_CLOUD_SQL_INSTANCE="<your-project>:<region>:<instance>"
```

**2. The Client Configuration (`mcp.json`)**
The AI client reads its tools from your global configuration file (e.g. `C:\\Users\\<Your Name>\\.gemini\\mcp.json`). Point it to the wrapper script inside this project:

```json
{
  "mcpServers": {
    "postgres-prod": {
      "command": "node",
      "args": [
        "c:/path/to/your/repo/wot-box/scripts/mcp-wrapper.js"
      ]
    }
  }
}
```

*Note: You must restart the AI client / IDE extension after modifying `.env` or your global `mcp.json` for the changes to take effect.*

## 3. Provisioning the Read-Only User (Admin Only)
If the `wot-box-read-only` user loses access or new tables are created, an administrator must re-grant permissions using the table owner (`wot_box_user`).

```sql
-- Connect to the database as wot_box_user (the table owner)
GRANT CONNECT ON DATABASE wot_box_db TO "wot-box-read-only";
GRANT USAGE ON SCHEMA public TO "wot-box-read-only";

-- Grant read access to existing tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO "wot-box-read-only";

-- Ensure future tables created by wot_box_user are also readable by the AI
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO "wot-box-read-only";
```

## 4. Usage
Once configured and running, you can simply ask the AI questions like:
- *"Check the database to see the 5 most recent feedback submissions."*
- *"Use your database triage skill to find out why john@example.com cannot see the 'Office Supplies' box."*

The AI will automatically use the `query` tool to execute a safe `SELECT` statement and analyze the results.
