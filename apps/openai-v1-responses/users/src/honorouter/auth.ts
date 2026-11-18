import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { createFactory } from 'hono/factory';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const factory = createFactory<{ Variables: { userId: string; jwt: string } }>();
const jwtSecret = 'extends-ai-user-login-secret';
const jwtStringZod = z.string().min(1);
const jwtZod = z.object({ sub: z.string().min(1), kind: z.never().optional() });
const refreshJwtZod = jwtZod.extend({ kind: z.literal('refresh') });
const verifyJwt = async (jwt: z.infer<typeof jwtStringZod>) => jwtZod.parse(await verify(jwt, jwtSecret, 'HS256'));
const verifyRefreshJwt = async (jwt: z.infer<typeof jwtStringZod>) => refreshJwtZod.parse(await verify(jwt, jwtSecret, 'HS256'));
const signJwt = ({ sub }: z.infer<typeof jwtZod>) => sign({ sub, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 }, jwtSecret, 'HS256');
const middleware = factory.createMiddleware(async (c, next) => {
    const loginKey = 'userlogin';
    const refreshKey = 'userrefresh';
    const jwt = getCookie(c, loginKey);
    if (jwt) {
        let verified = false;
        try {
            const payload = await verifyJwt(jwt);
            verified = true;
            c.set('userId', payload.sub);
            c.set('jwt', jwt);
            return next();
        } catch (error) {
            if (verified) throw error;
            deleteCookie(c, loginKey, { path: '/' });
        }
    }
    const refreshJwt = getCookie(c, refreshKey);
    if (refreshJwt) {
        let verified = false;
        try {
            const payload = await verifyRefreshJwt(refreshJwt);
            verified = true;
            const newJwt = await signJwt({ sub: payload.sub });
            setCookie(c, loginKey, newJwt, { httpOnly: true, sameSite: 'Lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
            c.set('userId', payload.sub);
            c.set('jwt', newJwt);
            return next();
        } catch (error) {
            if (verified) throw error;
            deleteCookie(c, refreshKey, { path: '/' });
        }
    }
    const now = new Date();
    const today = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    if (c.req.query('userlogin') === today) {
        const newJwt = await signJwt({ sub: today });
        const newRefreshJwt = await sign({ sub: today, kind: 'refresh', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 400 }, jwtSecret, 'HS256');
        setCookie(c, loginKey, newJwt, { httpOnly: true, sameSite: 'Lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
        setCookie(c, refreshKey, newRefreshJwt, { httpOnly: true, sameSite: 'Lax', maxAge: 60 * 60 * 24 * 400, path: '/' });
        c.set('userId', today);
        c.set('jwt', newJwt);
        return next();
    }
    return c.html(`<!doctype html><meta charset="utf-8"><script>
const value=prompt("请输入口令")
if (value === null) history.back()
else { const url=new URL(location.href); url.searchParams.set("userlogin", value); location.replace(url) }
</script>`);
});

const refreshJwtPath = '/refreshJwt';
const refreshJwtApp = factory.createApp().post(
    refreshJwtPath,
    zValidator('json', jwtStringZod),
    async c => {
        const payload = await verifyRefreshJwt(c.req.valid('json'));
        return c.text(await signJwt({ sub: payload.sub }));
    },
);

export default { factory, middleware, refreshJwtPath, refreshJwtApp, verifyJwt };
