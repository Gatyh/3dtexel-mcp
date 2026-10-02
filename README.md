# 3D Texel MCP server

[![Listed on mcpservers.org](https://mcpservers.org/badge.svg)](https://mcpservers.org/servers/gatyh/3dtexel-mcp)

Give Claude, Cursor, ChatGPT, Windsurf, Cline or any MCP client access to [3D Texel](https://3dtexel.com):

- **Search and download 7,000+ assets**: 1,600+ free CC0 handmade PBR materials, HDRIs, decals, 3D models, IES profiles, atlases and landscapes, plus 5,600+ AI assets (materials, HDRI skyboxes, decals, heightmaps, 4,000+ UE5/Mixamo animations, 3D models, alpha brushes).
- **Generate** seamless PBR materials (albedo, normal, roughness, height; 2K/4K/native 4K), true-HDR 360° HDRIs/skyboxes (2K/4K/8K) and AI textures with your 3D Texel credits.
- **Safe by design**: every paid action needs the price you accepted, each key has a daily credit cap, failed generations are refunded automatically, and the server can never pay: buying credits is a link you open yourself.

## Remote server (recommended)

`https://3dtexel.com/wp-json/3dtexel-api/v1/mcp` (Streamable HTTP). Without a key: search, asset details and prices. With a key (header `Authorization: Bearer tx_live_…`, create it at https://3dtexel.com/api-keys/): downloads, generations, balance.

## Local (stdio) bridge

Run it straight from this GitHub repository (the built `dist/` is committed, nothing to compile):

```json
{ "mcpServers": { "3dtexel": { "command": "npx", "args": ["-y", "github:Gatyh/3dtexel-mcp"] } } }
```

> The npm package `@3dtexel/mcp` is coming soon. Until it is published, use `github:Gatyh/3dtexel-mcp` as shown here; once it is on npm, `npx -y @3dtexel/mcp` will work the same way.

Connect your account once, without copying keys:

```
npx -y github:Gatyh/3dtexel-mcp login     # shows a code, you approve on 3dtexel.com
npx -y github:Gatyh/3dtexel-mcp status
npx -y github:Gatyh/3dtexel-mcp logout    # revokes the key
```

Or set `TEXEL_API_KEY` in the `env` block. The key is stored in your user config folder (`%APPDATA%\3dtexel` or `~/.config/3dtexel`), never printed.

## Tools

`search_assets`, `get_asset`, `download_asset`, `list_generators`, `quote_generation`, `generate_pbr_material`, `generate_hdri`, `generate_texture`, `get_generation`, `list_generations`, `cancel_generation`, `get_balance`, `list_my_library`, `list_credit_packs`, `create_checkout_link`.

Licenses: free assets are CC0 (public domain); AI/premium assets and generations use the 3DTexel License (commercial use allowed, credit 3DTexel, no resale of raw files, no AI training). REST API and OpenAPI: https://3dtexel.com/developers/
