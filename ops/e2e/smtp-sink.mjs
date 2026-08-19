// Minimaler SMTP-Server ohne Abhängigkeiten, der eingehende Mails an eine
// Datei anhängt. Genug SMTP, damit nodemailers verify() und sendMail() durchlaufen.
// Nur für lokale E2E-Tests — niemals in Produktion verwenden.
import net from "node:net";
import fs from "node:fs";

const PORT = Number(process.env.SMTP_SINK_PORT ?? "2525");
const LOG = process.env.SMTP_SINK_LOG ?? "/tmp/schulsani-e2e/mail.log";

fs.mkdirSync(new URL(".", `file://${LOG}`).pathname, { recursive: true });

const server = net.createServer((socket) => {
  socket.setEncoding("utf8");
  let buf = "";
  let inData = false;
  let data = "";
  socket.write("220 localhost ESMTP\r\n");

  socket.on("data", (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\r\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 2);

      if (inData) {
        if (line === ".") {
          inData = false;
          fs.appendFileSync(LOG, `\n=====BEGIN MESSAGE=====\n${data}=====END MESSAGE=====\n`);
          data = "";
          socket.write("250 OK: queued\r\n");
        } else {
          data += line.replace(/^\./, "") + "\n";
        }
        continue;
      }

      const up = line.toUpperCase();
      if (up.startsWith("EHLO") || up.startsWith("HELO")) {
        socket.write("250-localhost\r\n250-SIZE 10485760\r\n250 OK\r\n");
      } else if (up.startsWith("MAIL FROM") || up.startsWith("RCPT TO")) {
        socket.write("250 OK\r\n");
      } else if (up === "DATA") {
        inData = true;
        socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
      } else if (up === "QUIT") {
        socket.write("221 Bye\r\n");
        socket.end();
      } else {
        socket.write("250 OK\r\n");
      }
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`SMTP sink listening on 127.0.0.1:${PORT}, log: ${LOG}`);
});
