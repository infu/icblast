import express from "express";
import serve from "express-static";
import open from "open";
import {
  Ed25519KeyIdentity,
  DelegationChain,
  DelegationIdentity,
} from "@dfinity/identity";
import * as url from "url";
import path from "path";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

export const internetIdentity = () => {
  return new Promise(async (resolve, reject) => {
    const app = express();

    app.use(express.json());

    app.post("/key", function (req, res) {
      let key = Ed25519KeyIdentity.fromJSON(req.body.key);
      let chain = DelegationChain.fromJSON(req.body.chain);
      let identity = DelegationIdentity.fromDelegation(key, chain);
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
