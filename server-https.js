const fs = require("fs");
const path = require("path");
const https = require("https");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const port = process.env.PORT || 3000;
const host = "0.0.0.0";

const keyPath = path.join(__dirname, "certs", "dev-key.pem");
const certPath = path.join(__dirname, "certs", "dev-cert.pem");

app.prepare().then(() => {
  const server = https.createServer(
    {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    },
    (req, res) => handle(req, res)
  );

  server.listen(port, host, () => {
    console.log(`> HTTPS server running at https://0.0.0.0:${port}`);
    console.log(`> Open from phone: https://<IP-PC>:${port}/ (accetta il certificato)`);
  });
});
