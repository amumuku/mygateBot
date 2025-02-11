import crypto from 'crypto';

const x = (n) => {
    const t = new Date();
    const e = Date.UTC(
        t.getUTCFullYear(),
        t.getUTCMonth(),
        t.getUTCDate(),
        t.getUTCHours(),
        t.getUTCMinutes(),
        t.getUTCSeconds(),
        t.getUTCMilliseconds()
    );

    const secretKey = "|`8S%QN9v&/J^Za";
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(JSON.stringify(n) + e);

    const r = hmac.digest('hex');

    return {
        timestamp: e,
        signature: r
    };
};
export default x;
