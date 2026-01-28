import axios from 'axios';
import { getDb } from '../db/index.js';

// Assuming GoogleStudio service runs on port 1234
const GOOGLE_STUDIO_URL = process.env.GOOGLE_STUDIO_URL || 'http://localhost:1234';

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
            const { driveid } = ctx.request.query;
            const response = await axios.get(`${GOOGLE_STUDIO_URL}/api/chatcontent`, {params: driveid});
            ctx.body = response.data;
        } catch (err) {
            console.error('[GenerateController] Error:', err.message);
            ctx.status = 502;
            ctx.body = { error: 'Failed to communicate with AI service: ' + err.message };
        }
    },
    async initChatContent(ctx) {
        const { prompt, modelLabel, modelValue } = ctx.request.body;
        if (!prompt) {
            ctx.status = 400;
            ctx.body = { error: 'prompt is required' };
            return;
        }
        try {
            const response = await axios.post(
                `${GOOGLE_STUDIO_URL}/api/initChatContent`, 
                { prompt, modelLabel, modelValue });
            const { data } = response.data;
            if (data && data.driveid) {
                const db = await getDb();
                await db.run(`
                    INSERT INTO chat_record (drive_id, chat_content, create_time)
                    VALUES (?, ?, ?)
                `, data.driveid, data.chatDomContent, Date.now());
            }
            ctx.body = response.data;

        } catch (e) {
            ctx.status = 502;
            ctx.body = { error: 'Failed to save chat record: ' + e.message };
            console.error('Failed to save chat record:', e);
        }
    },
    async chatmsg(ctx) {
        const {driveid, prompt} = ctx.request.body;
        if (!prompt) {
            ctx.status = 400;
            ctx.body = { error: 'prompt is required' };
            return;
        }
        const response = await axios.post(`${GOOGLE_STUDIO_URL}/api/chatmsg`, { driveid, prompt });
        const db = await getDb();
        await db.run(`
            UPDATE chat_record 
            SET chat_content = ?, update_time = ?
            WHERE drive_id = ?
        `, response.data.chatDomContent, Date.now(), driveid);
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
            const { fileName, targetPath, uuid, driveid } = data;
            console.log('[GenerateController] buildCode: ', data);
            const isProcessed = 0; //1: processed, 0: not processed 2: processing
            const db = await getDb();
            
            await db.run(`
                UPDATE chat_record 
                SET uuid = ?, update_time = ?
                WHERE drive_id = ?
            `, uuid, Date.now(), driveid);
            await db.run(`
                INSERT INTO build_record (file_name, target_path, is_processed, create_time, update_time, drive_id, id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, fileName, targetPath, isProcessed, Date.now(), Date.now(), driveid, uuid);

            ctx.body = 'ok'
        } catch (err) {
            console.error('[GenerateController] Error:', err.message);
            ctx.status = 502;
            ctx.body = { error: 'Failed to save code: ' + err.message };
        }
    }
};
