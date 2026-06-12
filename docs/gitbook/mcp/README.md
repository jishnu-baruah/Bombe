# MCP server

Bombe ships an MCP (Model Context Protocol) server that exposes the keyless public API as tools, so any MCP-capable agent can discover assets, read a verdict, verify it, and request a paid attestation with no human in the loop.

Package: `@bombe/mcp` (`packages/mcp`). It talks to the live API over HTTPS; by default `https://bombe-web.vercel.app`. Override with the `BOMBE_API` environment variable.

## Connect

The server speaks stdio. Run it directly:

```sh
node --import tsx packages/mcp/src/index.ts
# or, from the package
pnpm --filter @bombe/mcp start
```

Register it with an MCP client (config shape varies by client):

```json
{
  "mcpServers": {
    "bombe": {
      "command": "node",
      "args": ["--import", "tsx", "packages/mcp/src/index.ts"],
      "env": { "BOMBE_API": "https://bombe-web.vercel.app" }
    }
  }
}
```

No keys are needed for the read, verify, and check tools. The request tool is paid but still non-custodial: the agent pays from its own wallet and passes the resulting tx hash.

## In this section

| Page | What it covers |
|------|----------------|
| [Tools](tools.md) | Every MCP tool, its parameters, and a typical agent loop |
| [Discovery for agents](discovery.md) | `llms.txt`, robots, sitemap, and the keyless API surface |

Next: [Tools](tools.md).
