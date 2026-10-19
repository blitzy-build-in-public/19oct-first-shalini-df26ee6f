# nodejs-tutorial-hello-world

A single-endpoint Node.js HTTP server, written as a reference implementation for beginners learning
how Node.js handles HTTP requests.

## Purpose

This server answers exactly one route. `GET /hello` returns status `200`, the header
`Content-Type: text/plain` and the body `Hello world`.

Every other request is answered by a catch-all. Any other path, and any method other than `GET` on
`/hello`, returns status `404`, the header `Content-Type: text/plain` and the body `Not Found`.

The whole application is the single file `server.js`. There is exactly one endpoint plus the
catch-all, no framework, no dependencies and no build step, so every HTTP concern stays visible in
the source you read.

## Prerequisites

Node.js 18.0.0 or later. Check the version you have installed:

```bash
node --version
```

If that prints a version below 18.0.0, install a newer Node.js first. `package.json` records the same
floor in its `engines.node` field, but npm does not enforce that field by default, so the requirement
is stated here where you actually rely on it.

No other prerequisite exists. There is no database, no external service, and nothing is downloaded
while the server runs.

## Installation

Nothing beyond Node.js. The project declares no dependencies, so there is nothing to install and no
`npm install` step: running that command would install nothing and is not needed.

Clone or download the project and change into its directory. That is the whole setup — the server is
one file that Node.js runs directly.

## Running

Start the server with either of these two commands, from the project directory:

```bash
node server.js
```

```bash
npm start
```

`npm start` runs the `start` script declared in `package.json`, which is `node server.js`, so both
commands start the same server with the same behavior.

Once the port is bound, the server prints one line and then keeps running in the foreground:

```console
Server listening on port 3000
```

The server prints nothing before the port is bound, so that line means the server is ready to accept
requests. The one difference between the two commands is that `npm start` prints a short banner of
its own first; the server's own line is the one reading `Server listening on port 3000`.

## Testing

With the server running, request the one route. The `-i` option makes `curl` show the response
headers as well as the body:

```bash
curl -i http://localhost:3000/hello
```

```console
HTTP/1.1 200 OK
Content-Type: text/plain
Date: Mon, 19 Oct 2026 08:18:07 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Content-Length: 11

Hello world
```

The `Date` header carries the time of the response, so its value is different on every run. Without
`-i`, `curl http://localhost:3000/hello` prints the body on its own:

```console
Hello world
```

Any other path answers with the catch-all:

```bash
curl -i http://localhost:3000/invalid
```

```console
HTTP/1.1 404 Not Found
Content-Type: text/plain
Date: Mon, 19 Oct 2026 08:18:07 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Content-Length: 9

Not Found
```

Every request writes one line to the console the server is running in, before the request is routed:

```console
[2025-01-01T12:00:00.000Z] [GET] [/hello]
[2025-01-01T12:00:00.000Z] [GET] [/invalid]
```

Each line holds the arrival time as an ISO-8601 timestamp in UTC with milliseconds, the HTTP method,
and the request path — with no query string, because the query string is discarded before the line is
written and before the request is matched. Each request produces exactly one line, so the two
requests shown above produce exactly two such lines, in the order they arrived.

Four rules decide whether a request is answered with `Hello world` or with `Not Found`:

- Matching uses the URL pathname only. The query string is ignored, so `GET /hello?x=1` is treated as
  `/hello` and returns `Hello world`.
- Matching is exact. There is no tolerance for a trailing slash, so `/hello/` returns `Not Found`.
- Matching is case-sensitive, so `/Hello` returns `Not Found`.
- The method is part of the match, so `POST /hello` returns `Not Found` because the request is not a
  `GET`.

## Stopping

Press CTRL+C in the terminal where the server is running. That sends `SIGINT`, and the server:

- prints one line stating that the server is shutting down
- stops accepting new connections
- lets any request that is already being answered finish
- exits with status 0

```console
Server shutting down
```

Shutdown finishes promptly even when a client is still connected and idle, so the process does not
hang waiting for that connection to close. Under `npm start` the `npm` command itself reports status
130, because the interrupt reaches npm as well as the server; the server has still shut down cleanly,
and running `node server.js` directly leaves status 0 behind it.

## Configuration

The server reads one environment variable, `PORT`, which is the port it listens on.

- Default: `3000`, used when `PORT` is unset.
- Valid values: an integer from `1024` to `65535`, digits only and inclusive at both ends. A port
  below `1024` is rejected rather than bound.
- Invalid values: the server prints one message naming the value and the accepted range, then exits
  with a non-zero status. No server is started and no port is bound, so nothing is listening.

To run on a different port, set `PORT` for the command:

```bash
PORT=8080 npm start
```

The server then reports the port it is using:

```console
Server listening on port 8080
```

It answers on port 8080, so the examples above become `curl http://localhost:8080/hello`. A value
outside the accepted range is refused:

```bash
PORT=80 node server.js
```

```console
Invalid PORT "80": expected an integer between 1024 and 65535.
```

That message goes to the error stream and the command exits with a non-zero status, so nothing is
left listening. Ports below 1024 are refused this way rather than bound; running the same command
through `npm start` prints npm's banner first and then the same message.
