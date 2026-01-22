import axios from 'axios';
import { getDb } from '../db/index.js';

// Assuming GoogleStudio service runs on port 8080
const GOOGLE_STUDIO_URL = process.env.GOOGLE_STUDIO_URL || 'http://localhost:8080';

export const GenerateController = {
    async generate(ctx) {
        const { prompt } = ctx.request.body;
        if (!prompt) {
            ctx.status = 400;
            ctx.body = { error: 'Prompt is required' };
            return;
        }

        try {
            // Forward request to GoogleStudio service
            // This assumes GoogleStudio has an /api/task endpoint
            const response = await axios.post(`${GOOGLE_STUDIO_URL}/api/task`, { prompt });
            
            ctx.body = response.data;
        } catch (err) {
            console.error('[GenerateController] Error:', err.message);
            ctx.status = 502;
            ctx.body = { error: 'Failed to communicate with AI service: ' + err.message };
        }
    },

    async chatcontent(ctx) {
        try {
            const response = await axios.get(`${GOOGLE_STUDIO_URL}/api/chatcontent`);
            
            ctx.body = response.data;
        } catch (err) {
            console.error('[GenerateController] Error:', err.message);
            ctx.status = 502;
            ctx.body = { error: 'Failed to communicate with AI service: ' + err.message };
        }
    },
    async initChatContent(ctx) {
        const { prompt } = ctx.request.body;
        if (!prompt) {
            ctx.status = 400;
            ctx.body = { error: 'prompt is required' };
            return;
        }
        const response = await axios.post(`${GOOGLE_STUDIO_URL}/api/initChatContent`, { prompt });
        ctx.body = response.data;
    },
    async chatmsg(ctx) {
        const { prompt } = ctx.request.body;
        if (!prompt) {
            ctx.status = 400;
            ctx.body = { error: 'prompt is required' };
            return;
        }
        console.log('[GenerateController] prompt: ', prompt);
        const response = await axios.post(`${GOOGLE_STUDIO_URL}/api/chatmsg`, { prompt });
        console.log('[GenerateController] response: ', response.data);
        ctx.body = response.data;
    },
    async downloadcode(ctx) {
        const { data } = ctx.request.body;
        const response = await axios.post(`${GOOGLE_STUDIO_URL}/api/download`, { data });
        ctx.body = response.data;
    },
    async deploywithcode(ctx) {
        const { data } = ctx.request.body;
        console.log('[GenerateController] deploywithcode: ', data);
        const response = await axios.post(`${GOOGLE_STUDIO_URL}/api/deploywithcode`, { data });
        ctx.body = response.data;
    },
    async buildCode(ctx) {
        const { data } = ctx.request.body;
        try {
            const { fileName, targetPath, id, code } = data;
            console.log('[GenerateController] buildCode: ', data);
            const isProcessed = 0; //1: processed, 0: not processed 2: processing
            const db = await getDb();
            
            await db.run(`
                INSERT OR REPLACE INTO generated_codes (id, file_name, target_path, code, is_processed, date_time)
                VALUES (?, ?, ?, ?, ?, ?)
            `, id, fileName, targetPath, code, isProcessed, Date.now());

            ctx.body = 'ok'
        } catch (err) {
            console.error('[GenerateController] Error:', err.message);
            ctx.status = 502;
            ctx.body = { error: 'Failed to save code: ' + err.message };
        }
    }
};
