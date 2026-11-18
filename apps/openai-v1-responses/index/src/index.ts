import hono from './declare/hono';
import responsesKasmvncChrome from 'responses-kasmvnc-chrome';
import auth from 'users/honorouter/auth';

const app = auth.factory.createApp();
app.route('/', auth.refreshJwtApp);
app.route('/', responsesKasmvncChrome.app);
const server = hono.honoServer(app);
responsesKasmvncChrome.injectWebSocket(server);
export default server;
