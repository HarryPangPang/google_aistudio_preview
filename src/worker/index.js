import { getDb } from '../db/index.js';
import { BuildService } from '../services/BuildService.js';

let isProcessing = false;
let scanTimer = null;

// 扫描间隔配置
const SCAN_INTERVAL = {
    IDLE: 10000,      // 空闲时10秒扫描一次
    BUSY: 30000,      // 有任务运行时30秒后再扫
};

export const startWorker = async () => {
    console.log('[Worker] Started build worker with dynamic scheduling');

    // 启动时恢复被中断的任务
    await recoverInterruptedTasks();

    // 开始扫描
    scheduleNextScan(SCAN_INTERVAL.IDLE);
};

/**
 * 恢复被中断的任务
 * 启动时将所有 is_processed=2 的任务重置为 0
 */
const recoverInterruptedTasks = async () => {
    try {
        const db = await getDb();
        const result = await db.run('UPDATE build_record SET is_processed = 0 WHERE is_processed = 2');

        if (result.changes > 0) {
            console.log(`[Worker] Recovered ${result.changes} interrupted task(s)`);
        }
    } catch (err) {
        console.error('[Worker] Failed to recover interrupted tasks:', err);
    }
};

/**
 * 调度下次扫描
 */
const scheduleNextScan = (delay) => {
    // 清除之前的定时器
    if (scanTimer) {
        clearTimeout(scanTimer);
    }

    scanTimer = setTimeout(async () => {
        await scanAndProcess();
    }, delay);
};

/**
 * 扫描并处理任务
 */
const scanAndProcess = async () => {
    if (isProcessing) {
        console.log('[Worker] Task is already processing, skipping scan');
        scheduleNextScan(SCAN_INTERVAL.BUSY);
        return;
    }

    isProcessing = true;

    try {
        // 检查是否有待处理的任务
        const db = await getDb();

        // 先检查是否有正在处理的任务
        const processingTask = await db.get('SELECT id FROM build_record WHERE is_processed = 2');
        if (processingTask) {
            console.log(`[Worker] Task ${processingTask.id} is still processing, will check again in 30s`);
            scheduleNextScan(SCAN_INTERVAL.BUSY);
            return;
        }

        // 检查待处理的任务
        const pendingTask = await db.get('SELECT id FROM build_record WHERE is_processed = 0 LIMIT 1');

        if (pendingTask) {
            console.log(`[Worker] Starting task: ${pendingTask.id}`);

            // 处理任务
            await BuildService.getGeneratedCode();

            // 任务完成后立即检查是否还有其他任务
            const nextTask = await db.get('SELECT id FROM build_record WHERE is_processed = 0 LIMIT 1');
            if (nextTask) {
                console.log(`[Worker] More tasks pending, will scan in 30s`);
                scheduleNextScan(SCAN_INTERVAL.BUSY);
            } else {
                console.log(`[Worker] No more tasks, will scan in 10s`);
                scheduleNextScan(SCAN_INTERVAL.IDLE);
            }
        } else {
            // 没有任务，10秒后再扫描
            console.log('[Worker] No pending tasks, will scan in 10s');
            scheduleNextScan(SCAN_INTERVAL.IDLE);
        }
    } catch (err) {
        console.error('[Worker] Scan error:', err);
        // 出错后10秒再试
        scheduleNextScan(SCAN_INTERVAL.IDLE);
    } finally {
        isProcessing = false;
    }
};
