# OpenCode Log Viewer - Documentation API

## Overview

OpenCode exposes a REST API on port 3000 that provides access to session data, messages, and real-time events. This document explains how the data is structured and how to use the API.

## Important: Port 3000

**Only one instance can use port 3000.** 

OpenCode runs on port 3000 (via Podman). If you try to start OpenCode again while it's already running, you'll get an error because the port is already in use.

To restart OpenCode:
1. Stop the current container
2. Start it again with `podman-compose up -d` (or your equivalent command)

## Base URL

```
http://localhost:3000
```

## Testing the API

### Check if OpenCode is running

```bash
curl http://localhost:3000/session
```

If it returns JSON data, OpenCode is running. If you get a connection error, OpenCode is not running or not accessible.

## API Endpoints

### 1. Get All Sessions

**Endpoint:** `GET /session`

Returns a list of all sessions.

```bash
curl http://localhost:3000/session
```

**Response:**
```json
[
  {
    "id": "ses_3994a054fffedJCLU7MZInAJRI",
    "slug": "brave-planet",
    "version": "local",
    "projectID": "global",
    "directory": "/agents/shared",
    "title": "Tests: creer 2 fichiers, supprimer 1",
    "time": {
      "created": 1771249728176,
      "updated": 1771249760164
    },
    "summary": {
      "additions": 0,
      "deletions": 0,
      "files": 0
    }
  }
]
```

### 2. Get Single Session

**Endpoint:** `GET /session/{sessionId}`

Returns detailed information about a specific session.

```bash
curl http://localhost:3000/session/ses_3994a054fffedJCLU7MZInAJRI
```

### 3. Get Session Messages

**Endpoint:** `GET /session/{sessionId}/message`

Returns all messages in a session.

```bash
curl "http://localhost:3000/session/ses_3994a054fffedJCLU7MZInAJRI/message"
```

### 4. Subscribe to Events (WebSocket)

**Endpoint:** `GET /events`

Real-time event streaming for session updates.

## Data Structures

### Session Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique session identifier (format: `ses_XXXXXXXXXXXX`) |
| `slug` | string | Human-readable identifier (e.g., "brave-planet") |
| `version` | string | OpenCode version ("local") |
| `projectID` | string | Project identifier |
| `directory` | string | Working directory for the session |
| `title` | string | Session title |
| `time.created` | number | Unix timestamp (ms) of session creation |
| `time.updated` | number | Unix timestamp (ms) of last update |
| `summary.additions` | number | Total lines added |
| `summary.deletions` | number | Total lines deleted |
| `summary.files` | number | Number of files modified |

### Message Object

Each message has two main sections: `info` (metadata) and `parts` (content).

```json
{
  "info": {
    "id": "msg_c66b5fad500127YV87zDLpy6hT",
    "sessionID": "ses_3994a054fffedJCLU7MZInAJRI",
    "role": "assistant",
    "time": {
      "created": 1771249728213,
      "completed": 1771249754910
    },
    "parentID": "msg_c66b5fab3001iQ8L4UhxpKaUm1",
    "modelID": "big-pickle",
    "providerID": "opencode",
    "mode": "build",
    "agent": "build",
    "path": {
      "cwd": "/agents/shared",
      "root": "/"
    },
    "cost": 0,
    "tokens": {
      "total": 13830,
      "input": 21,
      "output": 122,
      "reasoning": 42,
      "cache": {
        "read": 13687,
        "write": 0
      }
    },
    "finish": "tool-calls"
  },
  "parts": [...]
}
```

#### Message Info Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique message identifier |
| `sessionID` | string | Parent session ID |
| `role` | string | Message role: "user" or "assistant" |
| `time.created` | number | Unix timestamp when message started |
| `time.completed` | number | Unix timestamp when message finished |
| `parentID` | string | ID of the parent message (for threading) |
| `modelID` | string | AI model used (e.g., "big-pickle") |
| `providerID` | string | Model provider (e.g., "opencode") |
| `mode` | string | OpenCode mode: "build", "docs", "plan" |
| `agent` | string | Agent type used |
| `path.cwd` | string | Current working directory |
| `path.root` | string | Root directory |
| `cost` | number | Financial cost of the request |
| `tokens.total` | number | Total tokens used |
| `tokens.input` | number | Input tokens |
| `tokens.output` | number | Output tokens |
| `tokens.reasoning` | number | Reasoning tokens |
| `tokens.cache.read` | number | Cache tokens read |
| `tokens.cache.write` | number | Cache tokens written |
| `finish` | string | Reason for completion: "tool-calls", "stop", "error" |

### Part Types

Messages contain "parts" which are individual pieces of content. The following part types exist:

#### 1. text

Text content from the AI or user.

```json
{
  "type": "text",
  "text": "Hello, how can I help you?"
}
```

#### 2. tool

A tool execution request or result.

```json
{
  "type": "tool",
  "callID": "call_function_553xcpiy6kg2_1",
  "tool": "write",
  "state": {
    "status": "completed",
    "input": {
      "content": "File content",
      "filePath": "/path/to/file.txt"
    },
    "output": "File written successfully.",
    "metadata": {
      "filepath": "/path/to/file.txt",
      "exists": false,
      "truncated": false
    }
  }
}
```

**Tool Input Fields (common):**
| Field | Description |
|-------|-------------|
| `content` | File content (for write) |
| `filePath` | Target file path |
| `oldString` | Original content (for edit) |
| `newString` | New content (for edit) |
| `command` | Shell command (for bash) |
| `description` | Command description |

#### 3. reasoning

Internal reasoning/thinking from the AI model.

```json
{
  "type": "reasoning",
  "text": "The user wants me to...",
  "time": {
    "start": 1771249733749,
    "end": 1771249754883
  }
}
```

#### 4. step-start

Marks the beginning of a processing step.

```json
{
  "type": "step-start",
  "name": "step_name"
}
```

#### 5. step-finish

Marks the end of a processing step.

```json
{
  "type": "step-finish",
  "status": "success",
  "reason": "tool-calls",
  "error": null
}
```

## Part Time Fields

Parts can include timing information:

| Field | Type | Description |
|-------|------|-------------|
| `time.start` | number | Unix timestamp when part started |
| `time.end` | number | Unix timestamp when part ended |
| `time.created` | number | Unix timestamp of creation |

## Available Tools

Based on the API data, the following tools are available:

| Tool | Description |
|------|-------------|
| `edit` | Edit a file (uses oldString/newString) |
| `write` | Write content to a file |
| `bash` | Execute shell commands |
| `read` | Read file content |
| `glob` | Find files by pattern |
| `grep` | Search in files |
| `websearch` | Search the web |
| `codesearch` | Search code online |
| `read_pdf` | Read PDF files |

## Real-time Events

OpenCode emits events that can be subscribed to:

### Event Types

- `session.updated` - Session was modified
- `message.created` - New message in a session

### Subscribing to Events

```javascript
const ws = new WebSocket('ws://localhost:3000/events');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
};
```

## Extracting Diffs

To get file modifications (diffs), the application extracts them from tool inputs:

1. **From `edit` tools**: Extract `oldString` and `newString` from input
2. **From `filediff` metadata**: Check `state.metadata.filediff` if available

Example extraction:
```javascript
if (input.oldString !== undefined || input.newString !== undefined) {
  const diff = {
    file: input.filePath,
    before: input.oldString,
    after: input.newString
  };
}
```

## Limitations

The following information is NOT available through the API:

- **Vector search / RAG** - No information about embeddings or vector database queries
- **Internal algorithms** - Decision-making processes are not exposed
- **Warnings** - No warning logs are stored
- **Detailed tool metadata** - Only basic tool execution info is available

## Authentication

Currently, the API appears to be open with no authentication required when accessed locally.

## Error Handling

Errors may appear in message info:
```json
{
  "error": {
    "name": "MessageAbortedError",
    "data": {
      "message": "The operation was aborted."
    }
  }
}
```

## File Structure

OpenCode stores data in:
- `/session/` - Session metadata
- `/message/` - Message data
- `/part/` - Individual parts
- `/project/` - Project configurations


## Notes

- All timestamps are in Unix milliseconds
- Session IDs follow format: `ses_XXXXXXXXXXXX`
- Message IDs follow format: `msg_XXXXXXXXXXXX`
- Part IDs follow format: `prt_XXXXXXXXXXXX`
- The API supports both JSON and potentially other formats
