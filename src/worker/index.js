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
        // 1. Get task
        const task = await DeploymentModel.getPendingTask();
        
        if (!task) {
            return;
        }

        console.log(`[Worker] Picked up task ${task.id}`);

        // 2. Mark as building
        await DeploymentModel.updateStatus(task.id, 'building');

        // 3. Build
        try {
            await BuildService.processBuild(task.id, task.files);
            
            // We need to update the URL
            const url = `http://localhost:${PORT}/Preview?id=${task.id}`;
            await DeploymentModel.updateStatus(task.id, 'ready', { url });
            
        } catch (err) {
            console.error(`[Worker] Task ${task.id} failed:`, err);
            await DeploymentModel.updateStatus(task.id, 'error', { error: err.message });
        }

        // If we processed a task, we might want to check again immediately 
        // instead of waiting for the next second tick, to clear the queue faster.
        // But with node-schedule strictly, we wait.
        // To hybridize: if queue might have more, recurse (but respect stack).
        // For now, adhere to schedule: wait 1 second.

    } catch (err) {
        console.error('[Worker] Error in loop:', err);
    }
};
