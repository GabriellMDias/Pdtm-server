import express, { Request, Response, Router } from "express";
import axios from "axios";
import { createWriteStream, readFileSync } from "fs";
import path from "path";

const router: Router = express.Router();

// Função para baixar o arquivo do Google Drive usando axios
const downloadFile = async (url: string, dest: string) => {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream", // Isso permite que a resposta seja tratada como um stream
  });

  const fileStream = createWriteStream(dest);
  return new Promise((resolve, reject) => {
    response.data.pipe(fileStream);
    response.data.on("error", reject);
    fileStream.on("finish", resolve);
  });
};

router.get("/getlatestversion", async (req: Request, res: Response) => {
  const fileUrl = "https://drive.usercontent.google.com/u/0/uc?id=1-Xyzm_0vlbQDKON8fSp5GssaFiOL8sjv&export=download"; // Link de download direto
  const filePath = path.join(__dirname, "latestVersion.json");

  try {
    // Baixar o arquivo usando axios
    await downloadFile(fileUrl, filePath);

    // Ler o conteúdo do arquivo JSON
    const fileContent = readFileSync(filePath, "utf-8");
    const jsonData = JSON.parse(fileContent);

    // Retornar o conteúdo do arquivo JSON
    res.json(jsonData);
  } catch (error) {
    console.error("Error downloading or reading the file:", error);
    res.status(500).send("An error occurred while processing the request.");
  }
});

export default router;
