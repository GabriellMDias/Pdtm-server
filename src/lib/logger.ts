import path from "path";
import fs from 'fs'

const log = (message?: any, ...optionalParams: any[]) => {
    const today = new Date()
    const fileName = `log (${today.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '-')}).txt`


    const logDirectory = path.join(__dirname, '..', '..', 'log');
    const logFilePath = path.join(logDirectory, fileName);

    // Ensure the log directory exists
    if (!fs.existsSync(logDirectory)) {
        fs.mkdirSync(logDirectory, { recursive: true });
    }


    const logMessage = [message, ...optionalParams].join('');

    console.log(logMessage)
    
    const logMessageWithNewLine = logMessage + '\n';

    fs.appendFile(logFilePath, logMessageWithNewLine, (err) => {
        if (err) {
            console.error('Erro ao escrever no arquivo de log:', err);
        }
    });
}

const error = (message?: any, ...optionalParams: any[]) => {
    const today = new Date()
    const fileName = `error log (${today.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '-')}).txt`


    const logDirectory = path.join(__dirname, '..', '..', 'log/error');
    const logFilePath = path.join(logDirectory, fileName);

    // Ensure the log directory exists
    if (!fs.existsSync(logDirectory)) {
        fs.mkdirSync(logDirectory, { recursive: true });
    }

    
    const logMessage = [message, ...optionalParams].join('');

    console.error(message, ...optionalParams)
    
    const logMessageWithNewLine = logMessage + '\n' + '-'.repeat(process.stdout.columns) + '\n\n';

    fs.appendFile(logFilePath, logMessageWithNewLine, (err) => {
        if (err) {
            console.error('Erro ao escrever no arquivo de log:', err);
        }
    });
}

const transmissionLog = (idStore: number, transmissionName: string, data: any[]) => {
    const now = new Date()
    const textLog = `-- TRANSMITINDO ${transmissionName} --\n${now}\nID LOJA: ${idStore}\n${JSON.stringify(data)}\n\n`
    logger.log(textLog)
}

export const logger = {
    log: log,
    error: error,
    transmissionLog: transmissionLog
}