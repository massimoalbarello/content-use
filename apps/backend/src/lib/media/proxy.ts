import { createServer, request as httpRequest } from 'node:http';
import { connect, type Socket } from 'node:net';
import { parsePublicUrl, publicAddress } from './public-url';
// Every yt-dlp HTTP request and CONNECT tunnel resolves and pins its destination here,
// including redirects, manifests, fragments and extractor requests.
export async function createDownloadProxy() {
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    void (async () => {
      const url = parsePublicUrl(req.url ?? '');
      if (url.protocol !== 'http:') {
        throw new Error('Use CONNECT for TLS.');
      }
      const address = await publicAddress(url.hostname);
      const headers: import('node:http').OutgoingHttpHeaders = { ...req.headers, host: url.host };
      delete headers['proxy-authorization'];
      delete headers['proxy-connection'];
      const upstream = httpRequest(
        {
          host: address,
          port: Number(url.port || 80),
          path: url.pathname + url.search,
          method: req.method,
          headers,
        },
        (response) => {
          res.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(res);
        },
      );
      upstream.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(502);
        }
        res.end();
      });
      upstream.setTimeout(30000, () => upstream.destroy());
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
    })().catch(() => {
      res.writeHead(403);
      res.end('Destination is not a public internet address.');
    });
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
  });
  server.on('connect', (req, client, head) => {
    void (async () => {
      const url = parsePublicUrl(`https://${req.url}`);
      const address = await publicAddress(url.hostname);
      if (client.destroyed) {
        return;
      }
      const upstream = connect({ host: address, port: Number(url.port || 443) });
      sockets.add(upstream);
      upstream.on('close', () => sockets.delete(upstream));
      upstream.on('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) {
          upstream.write(head);
        }
        client.pipe(upstream);
        upstream.pipe(client);
      });
      upstream.setTimeout(60000, () => upstream.destroy());
      upstream.on('error', () => client.destroy());
      client.on('error', () => upstream.destroy());
      client.on('close', () => upstream.destroy());
      upstream.on('close', () => client.destroy());
    })().catch(() => client.end('HTTP/1.1 403 Forbidden\r\n\r\n'));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not start download proxy.');
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.close();
    },
  };
}
