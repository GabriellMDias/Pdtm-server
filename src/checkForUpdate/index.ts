import express, { Router } from "express";
import { readFileSync } from "fs";
import path from "path";

const router: Router = express.Router();

router.use('/downloadlatest', express.static(path.join(__dirname, '../../apk')));

router.get('/getlatestversion/:ip/:port', (req, res) => {
  const {ip, port} = req.params

  const filePath = path.join(__dirname, "../../apk/latestVersion.json");
  const fileContent = readFileSync(filePath, "utf-8");
  const jsonData = JSON.parse(fileContent);

  jsonData.apkUrl = `http://${ip}:${port}/checkforupdate/downloadlatest/PdT-Mobile-latest.apk`

  res.json(jsonData);
});
export default router;
