import Router from 'koa-router';
import { DeployController } from '../controllers/DeployController.js';
import { PreviewController } from '../controllers/PreviewController.js';
import { AppController } from '../controllers/AppController.js';
import { GenerateController } from '../controllers/GenerateController.js';

const router = new Router();

// Deploy Routes
router.post('/api/deploy', DeployController.deploy);
router.get('/api/status/:id', DeployController.getStatus);

// App Routes (Source Storage)
router.post('/api/apps', AppController.save);
router.get('/api/apps', AppController.get);

// Generate Routes
router.post('/api/generate', GenerateController.generate);
router.get('/api/chatcontent', GenerateController.chatcontent);
router.post('/api/chatmsg', GenerateController.chatmsg);
router.post('/api/download', GenerateController.downloadcode);
router.post('/api/deploywithcode', GenerateController.deploywithcode);
router.post('/api/buildcode', GenerateController.buildCode);

// Preview Routes
router.get('/preview', PreviewController.entry);
router.get('/playground', PreviewController.playground);


export default router;
