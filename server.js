'use strict';

const http = require('http');

// The port used when PORT is unset, and the inclusive range a valid PORT must fall in.
const DEFAULT_PORT = 3000;
const MIN_PORT = 1024;
const MAX_PORT = 65535;

// How long shutdown waits for a socket that refuses to close before forcing exit status 0.
const SHUTDOWN_GRACE_MS = 2000;

// Resolve PORT into a usable port number, or into an error message describing the bad value.
function readPort(env) {
  const raw = env.PORT;

  if (raw === undefined) {
    return { port: DEFAULT_PORT };
  }

  // Digits only, so a sign, decimal point, exponent or surrounding space can never pass below.
  const digitsOnly = /^\d+$/.test(raw);
  const port = Number(raw);

  if (!digitsOnly || port < MIN_PORT || port > MAX_PORT) {
    const message =
      `Invalid PORT "${raw}": expected an integer between ${MIN_PORT} and ${MAX_PORT}.`;
    return { error: message };
  }

  return { port };
}

// Derive the request path from the request target, discarding everything from the first "?".
function getRequestPath(requestTarget) {
  // The target is cut at the first "?" and the rest is thrown away: it is never parsed or decoded.
  const queryStart = requestTarget.indexOf('?');
  const path = queryStart === -1 ? requestTarget : requestTarget.slice(0, queryStart);

  // An empty target, or one that starts with "?", leaves no path: keep the log line's shape always.
  return path === '' ? '/' : path;
}

// Write the one request log line: ISO-8601 timestamp, method and the path without its query string.
function logRequest(method, path) {
  console.log(`[${new Date().toISOString()}] [${method}] [${path}]`);
}

// The single place a status code and a content type are set, writing the body in one step.
function sendTextResponse(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/plain');
  res.end(body);
}

// Answer the one route this server serves.
function handleHello(res) {
  sendTextResponse(res, 200, 'Hello world');
}

// Answer every request that does not match the route.
function handleNotFound(res) {
  sendTextResponse(res, 404, 'Not Found');
}

// Hand the request to the handler its method and path select.
function routeRequest(method, path, res) {
  if (method === 'GET' && path === '/hello') {
    handleHello(res);
    return;
  }

  handleNotFound(res);
}

// Log an unexpected request error and answer the client without leaking any internal detail.
function handleUnexpectedError(err, res) {
  // The request is named through res.req, which avoids re-deriving the path that may have thrown.
  const requestTarget = res.req && res.req.url ? res.req.url : 'unknown request';
  const message = err instanceof Error ? err.message : String(err);

  console.error(`Request error for ${requestTarget}: ${message}`);

  // Headers already sent mean the response is half written: end it instead of writing a second one.
  if (res.headersSent) {
    res.destroy();
    return;
  }

  sendTextResponse(res, 500, 'Internal Server Error');
}

// The request pipeline: mark the socket busy, derive the path once, log the request, then route it.
function handleRequest(req, res) {
  try {
    // The busy mark is what lets shutdown tell an idle keep-alive socket from one still responding.
    req.socket.isRequestInFlight = true;
    res.on('finish', () => {
      req.socket.isRequestInFlight = false;
    });

    // One derived path feeds both the log line and the match, so no query string is ever logged.
    const path = getRequestPath(req.url);

    logRequest(req.method, path);
    routeRequest(req.method, path, res);
  } catch (err) {
    handleUnexpectedError(err, res);
  }
}

// Create the server with the request pipeline and track its live sockets for shutdown.
function createServer() {
  const server = http.createServer(handleRequest);
  const openSockets = new Set();

  server.on('connection', (socket) => {
    openSockets.add(socket);
    socket.on('close', () => openSockets.delete(socket));
  });

  return { server, openSockets };
}

// Attach the listening and fatal-error handlers, then bind the port.
function startServer(server, port) {
  // Printed once the port is bound, so the line means the server is really accepting requests.
  server.on('listening', () => {
    console.log(`Server listening on port ${port}`);
  });

  // A fatal startup failure prints one plain line on standard error and ends the process non-zero.
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // The suggested port stays inside the accepted range even at the top of it.
      const suggestion = port >= MAX_PORT ? MIN_PORT : port + 1;
      console.error(
        `Port ${port} is already in use. Choose another port with the PORT environment variable, ` +
          `for example PORT=${suggestion}.`
      );
    } else if (err.code === 'EACCES') {
      console.error(
        `Cannot bind port ${port}: permission denied. Choose a port from ${MIN_PORT} to ` +
          `${MAX_PORT} with the PORT environment variable.`
      );
    } else {
      console.error(`Failed to start the server on port ${port}: ${err.code || err.message}`);
    }

    process.exitCode = 1;
  });

  server.listen(port);
}

// Stop accepting connections, close the idle ones and let the process exit with status 0.
function handleShutdown(server, openSockets) {
  console.log('Server shutting down');

  // close() first: closing sockets before it would race with connections still being created.
  server.close();

  // Closing the idle keep-alive connections is what keeps shutdown from waiting them out.
  if (typeof server.closeIdleConnections === 'function') {
    server.closeIdleConnections();
  } else {
    // Runtimes before Node 18.2.0 lack closeIdleConnections(), so close the idle tracked sockets.
    for (const socket of openSockets) {
      if (!socket.isRequestInFlight) {
        socket.destroy();
      }
    }
  }

  // Forces status 0 if a socket refuses to close; unref'd so it never delays a clean exit.
  setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
}

// Wire the port, the server and the SIGINT handler together.
function main() {
  const { port, error } = readPort(process.env);

  if (error) {
    // Nothing is bound yet, so the loop drains on its own and only the exit status has to be set.
    console.error(error);
    process.exitCode = 1;
    return;
  }

  const { server, openSockets } = createServer();

  startServer(server, port);
  process.on('SIGINT', () => handleShutdown(server, openSockets));
}

main();
