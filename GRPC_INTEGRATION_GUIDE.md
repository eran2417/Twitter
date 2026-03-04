# gRPC Integration Setup Guide

## Backend (Express.js/Node.js) Dependencies

### Core gRPC Libraries

#### 1. `@grpc/grpc-js` - Main gRPC Runtime
```bash
npm install @grpc/grpc-js
```
**Purpose**: The core gRPC library for Node.js that provides server and client implementations. Handles the gRPC protocol, connection management, and service definitions.

**Usage**:
```javascript
const grpc = require('@grpc/grpc-js');

// Create a gRPC server
const server = new grpc.Server();
server.addService(authProto.AuthService.service, {
  Login: async (call, callback) => {
    // Handle login logic
    callback(null, { token: 'jwt-token' });
  }
});
```

#### 2. `@grpc/proto-loader` - Protocol Buffer Loader
```bash
npm install @grpc/proto-loader
```
**Purpose**: Dynamically loads `.proto` files at runtime without pre-generating code. Useful for development and when you want to avoid code generation steps.

**Usage**:
```javascript
const protoLoader = require('@grpc/proto-loader');
const packageDefinition = protoLoader.loadSync('auth.proto', {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const authProto = grpc.loadPackageDefinition(packageDefinition);
```

#### 3. `grpc-tools` - Code Generation Tools
```bash
npm install --save-dev grpc-tools
```
**Purpose**: Provides command-line tools for generating gRPC client/server code from `.proto` files. Includes the protoc compiler and plugins.

**Usage**:
```bash
# Generate JavaScript code from proto files
grpc_tools_node_protoc \
  --js_out=import_style=commonjs,binary:. \
  --grpc_out=grpc_js:. \
  --plugin=protoc-gen-grpc=`which grpc_tools_node_protoc_plugin` \
  -I . \
  auth.proto
```

## Frontend (React) Dependencies

#### 4. `grpc-web` - gRPC-Web Runtime
```bash
npm install grpc-web
```
**Purpose**: JavaScript library that enables web browsers to communicate with gRPC services. Provides the runtime for making gRPC calls from the browser.

**Usage**:
```javascript
import { grpc } from '@improbable-eng/grpc-web';
import { AuthServiceClient } from './auth_grpc_web_pb';

const client = new AuthServiceClient('http://localhost:8080');
```

#### 5. `protoc-gen-grpc-web` - Client Code Generator
**Download**: The binary you mentioned
**Purpose**: Generates JavaScript/TypeScript client code from `.proto` files that works with the `grpc-web` library.

**Usage**:
```bash
# Generate gRPC-Web client code
protoc -I=. \
  --js_out=import_style=commonjs:. \
  --grpc-web_out=import_style=commonjs,mode=grpcwebtext:. \
  auth.proto
```

## System-Level Tools

#### 6. Protocol Buffer Compiler (`protoc`)
**Installation**: 
- macOS: `brew install protobuf`
- Ubuntu: `apt install protobuf-compiler`
- Download from: https://github.com/protocolbuffers/protobuf/releases

**Purpose**: The main compiler that reads `.proto` files and generates code in various languages using plugins.

#### 7. gRPC-Web Proxy (Envoy/Traefik)
**Purpose**: Translates between gRPC-Web protocol (used by browsers) and gRPC protocol (used by servers).

**Example Envoy config**:
```yaml
static_resources:
  listeners:
  - address:
      socket_address:
        address: 0.0.0.0
        port_value: 8080
  clusters:
  - name: auth-service
    http2_protocol_options: {}
    endpoints:
    - lb_endpoints:
      - endpoint:
          address:
            socket_address:
              address: auth-service
              port_value: 50051
```

## Complete Integration Example

### 1. Define Service (auth.proto)
```protobuf
syntax = "proto3";

service AuthService {
  rpc Login(LoginRequest) returns (LoginResponse);
  rpc ValidateToken(ValidateTokenRequest) returns (ValidateTokenResponse);
}

message LoginRequest {
  string username = 1;
  string password = 2;
}

message LoginResponse {
  string token = 1;
  string user_id = 2;
}

message ValidateTokenRequest {
  string token = 1;
}

message ValidateTokenResponse {
  bool valid = 1;
  string user_id = 2;
}
```

### 2. Backend Implementation (Express.js + gRPC)
```javascript
const express = require('express');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const app = express();

// Load proto definition
const packageDefinition = protoLoader.loadSync('auth.proto');
const authProto = grpc.loadPackageDefinition(packageDefinition);

// Create gRPC server
const server = new grpc.Server();
server.addService(authProto.AuthService.service, {
  Login: (call, callback) => {
    // Authentication logic
    const { username, password } = call.request;
    // ... validate credentials
    callback(null, { token: 'jwt-token', user_id: '123' });
  },

  ValidateToken: (call, callback) => {
    const { token } = call.request;
    // ... validate token
    callback(null, { valid: true, user_id: '123' });
  }
});

// Start gRPC server on port 50051
server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
  server.start();
  console.log('gRPC server running on port 50051');
});

// Express routes for REST API
app.post('/api/login', (req, res) => {
  // REST endpoint that internally calls gRPC
  // This allows gradual migration
});

app.listen(3001, () => console.log('Express server on 3001'));
```

### 3. Frontend Implementation (React)
```javascript
import React, { useState } from 'react';
import { AuthServiceClient } from './auth_grpc_web_pb';
import { LoginRequest } from './auth_pb';

function LoginComponent() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    const client = new AuthServiceClient('http://localhost:8080'); // gRPC-Web proxy

    const request = new LoginRequest();
    request.setUsername(username);
    request.setPassword(password);

    client.login(request, {}, (err, response) => {
      if (err) {
        console.error('Login failed:', err);
      } else {
        console.log('Logged in:', response.getToken());
        localStorage.setItem('token', response.getToken());
      }
    });
  };

  return (
    <div>
      <input
        value={username}
        onChange={e => setUsername(e.target.value)}
        placeholder="Username"
      />
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button onClick={handleLogin}>Login</button>
    </div>
  );
}
```

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React App     │────│ gRPC-Web Proxy  │────│  Express + gRPC │
│                 │    │   (Envoy)       │    │   Services      │
│ • grpc-web lib  │    │                 │    │ • @grpc/grpc-js │
│ • Generated     │    │ Translates:     │    │ • proto-loader  │
│   client code   │    │ gRPC-Web ↔ gRPC │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Development Workflow

1. **Define APIs** in `.proto` files
2. **Generate code** using protoc with plugins
3. **Implement services** in backend
4. **Use generated clients** in frontend
5. **Test end-to-end** communication

## Benefits

- **Type Safety**: Strongly typed APIs
- **Performance**: Efficient binary protocol
- **Streaming**: Support for real-time features
- **Cross-Language**: Same API for web, mobile, backend
- **Code Generation**: Automatic client/server code

This setup provides a robust foundation for microservices communication with excellent performance and developer experience.</content>
<parameter name="filePath">/Users/erachaudhary/workspace/twitter/GRPC_INTEGRATION_GUIDE.md