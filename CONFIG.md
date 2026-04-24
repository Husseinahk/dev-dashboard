# DevControl — Config Reference

Full schema for `projects.json`.

## Top-level

```jsonc
{
  "globalSettings": { ... },
  "projects": [ ... ]
}
```

## globalSettings

```jsonc
{
  "port": 3030,                   // HTTP/WS port the server listens on
  "openBrowserOnStart": true,     // Automatically open browser when server starts
  "nvmHome": "",                  // Override NVM install dir. Empty = %NVM_HOME% or %APPDATA%\nvm
  "defaultGroups": [ ... ]        // Action groups available in every project
}
```

## projects[]

```jsonc
{
  "id": "my-project",             // Unique slug (used in URLs / keys)
  "name": "My Project",           // Display name in dropdown
  "path": "C:\\Projects\\my",     // Absolute path to project root
  "nodeVersion": "14",            // Optional: "14" matches v14.*; "20.11.0" matches exact
  "groups": [ ... ],              // Action groups (see below)
  "quickLinks": [ ... ]           // External links (see below)
}
```

## groups[]

```jsonc
{
  "name": "Backend",              // Shown as section header
  "actions": [ ... ]              // See Action types
}
```

If a project has a group with the same `name` as a `defaultGroups` entry, the project's group replaces the default.

## Action — common fields

```jsonc
{
  "id": "my-action",              // Unique within a project
  "label": "Display Name",        // Shown on button
  "type": "...",                  // See types below
  "command": "...",               // Shell command to run
  "cwd": "src/foo"                // Optional: subdirectory (relative to project.path)
}
```

### type: "long-running"

Spawns a persistent background process. Live log streaming. Click to toggle stop. Restart button available.

```jsonc
{
  "id": "start-api",
  "label": "Start API",
  "type": "long-running",
  "command": "dotnet run",
  "cwd": "src/MyApp.Api"
}
```

### type: "one-shot"

Runs and exits. Output streams, then process closes.

```jsonc
{
  "id": "build",
  "label": "Build",
  "type": "one-shot",
  "command": "dotnet build"
}
```

### type: "open"

Detached launch. No log streaming — the child runs independently.

```jsonc
{
  "id": "open-vs",
  "label": "Open in Visual Studio",
  "type": "open",
  "command": "devenv MyApp.sln"
}
```

### type: "prompt"

Shows a modal asking for input before running. Use `{name}` placeholders in the command.

```jsonc
{
  "id": "add-migration",
  "label": "EF Add Migration",
  "type": "prompt",
  "command": "dotnet ef migrations add {name} --project src/...",
  "promptFor": [
    { "name": "name", "label": "Migration Name", "placeholder": "e.g. 01_initial" }
  ]
}
```

### type: "chain"

Runs multiple action IDs sequentially. Great for "Start Everything".

```jsonc
{
  "id": "start-all",
  "label": "Start Everything",
  "type": "chain",
  "chain": ["start-api", "start-fe"]
}
```

## quickLinks[]

```jsonc
{
  "label": "Frontend",
  "url": "http://localhost:4200"
}
```

Clickable link in the top bar of the action area. Gets a green pulse when a long-running action in the same project reports "ready".

## nodeVersion matching

Given `"nodeVersion": "14"`:

1. Server reads `%NVM_HOME%\` (or `globalSettings.nvmHome`, or `%APPDATA%\nvm`)
2. Finds directories matching `v14*` (e.g. `v14.21.2`, `v14.17.6`)
3. Picks the **highest patch** (`v14.21.2` in the example)
4. Prepends its path to `env.PATH` **for this child process only**

If you want pinning, use the full version: `"nodeVersion": "14.21.2"`.

If `nodeVersion` is empty / missing → system default PATH is used.

## Complete Example

```jsonc
{
  "globalSettings": {
    "port": 3030,
    "openBrowserOnStart": true,
    "nvmHome": "",
    "defaultGroups": [
      {
        "name": "Git",
        "actions": [
          { "id": "git-status", "label": "Status", "type": "one-shot", "command": "git status" },
          { "id": "git-pull",   "label": "Pull",   "type": "one-shot", "command": "git pull" }
        ]
      }
    ]
  },
  "projects": [
    {
      "id": "my-app",
      "name": "My App",
      "path": "C:\\Projects\\my-app",
      "nodeVersion": "20",
      "groups": [
        {
          "name": "Backend",
          "actions": [
            { "id": "start-api", "label": "Start API", "type": "long-running", "command": "dotnet run", "cwd": "src/Api" }
          ]
        },
        {
          "name": "Frontend",
          "actions": [
            { "id": "start-fe", "label": "Start FE", "type": "long-running", "command": "npm run dev", "cwd": "src/client" }
          ]
        },
        {
          "name": "Workflows",
          "actions": [
            { "id": "start-all", "label": "Start Everything", "type": "chain", "chain": ["start-api", "start-fe"] }
          ]
        }
      ],
      "quickLinks": [
        { "label": "Frontend", "url": "http://localhost:5173" },
        { "label": "Swagger",  "url": "http://localhost:5000/swagger" }
      ]
    }
  ]
}
```
