import express from "express";
import serve from "express-static";
import open from "open";
import dfidentity from "@dfinity/identity";
import * as url from "url";
import path from "path";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

export const internetIdentity = () => {
  return new Promise(async (resolve, reject) => {
    const app = express();

    app.use(function (req, res, next) {
      var data = "";
      req.setEncoding("binary");
      req.on("data", function (chunk) {
        data += chunk;
      });

      req.on("end", function () {
        req.body = data;
        next();
      });
    });

    app.post("/key", function (req, res) {
      let buff = new Buffer.from(req.body, "binary");
      let rawBuffer = new Uint8Array(buff).buffer;
      let identity = dfidentity.Ed25519KeyIdentity.fromSecretKey(rawBuffer);
      resolve(identity);
      res.send("");
      server.close();
    });

    app.use(serve(path.resolve(__dirname, "../../public")));

    const server = app.listen(8888, function () {
      console.log("Authorize at http://localhost:8888");
    });

    await open("http://localhost:8888");
  });
};
