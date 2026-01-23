import schedule from 'node-schedule';
import { DeploymentModel } from '../models/DeploymentModel.js';
import { BuildService } from '../services/BuildService.js';
import { PORT } from '../config/constants.js';

let isProcessing = false;

export const startWorker = () => {
    console.log('[Worker] Started build worker with node-schedule');
    
    // Execute every second
    schedule.scheduleJob('*/1 * * * * *', async () => {
        if (isProcessing) return;
        isProcessing = true;
        
        try {
            await processNext();
        } catch (err) {
            console.error('[Worker] Job error:', err);
        } finally {
            isProcessing = false;
        }
    });

    // get generated code
    schedule.scheduleJob('*/10 * * * * *', async () => {
        try {
            await BuildService.getGeneratedCode();
        } catch (err) {
            console.error('[Worker] Error processing generated code:', err);
        }
    });
};

const processNext = async () => {
    try {
        BuildService.getGeneratedCode();
    } catch (err) {
        console.error('[Worker] Error in loop:', err);
    }
};
