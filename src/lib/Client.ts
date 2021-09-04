import fetch from 'node-fetch';
import crypto from 'crypto';
import { Cookie } from 'tough-cookie';
import getUserAgent from '../utils/user-agents';

class Client {
    private readonly baseUrl = 'https://www.instagram.com';
    private sharedData: any;
    private userAgent: string;
    private csrftoken: undefined | string;
    private credentials!: {
        username: string;
        password: string;
        cookies?: any;
    };

    private constructor({ username, password }: { username: string; password: string }) {
        this.credentials.username = username;
        this.credentials.password = password;
        this.userAgent = getUserAgent(username);
    }

    public async login() {
        const responseData: any = await (await this.fetch('/')).json();
        const matches = responseData?.body?.match(/(csrf_token":")\w+/g);

        this.csrftoken = matches![0].substring(13);

        const res = await this.fetch('/accounts/login/ajax/', {
            method: 'POST',
            body: { username: this.credentials.username, enc_password: this.encPassword }
        });

        if (!res.headers.get('set-cookie')) {
            throw new Error('No cookie');
        }

        // @ts-expect-error
        const cookies: Cookie[] = res.headers.get('set-cookie')?.map(Cookie.parse);

        this.csrftoken = cookies?.find(({ key }: { key: string }) => key === 'csrftoken')?.toJSON().value;

        this.credentials.cookies = cookies.map((cookie: Cookie) => cookie?.toJSON() as Cookie);

        this.sharedData = await this.getSharedData();

        return res.body;
    }

    public async getUserByUsername({ username }: { username: string }) {
        const res = await this.fetch(`/${username}/?__a=1`, {
            method: 'GET',
            headers: {
                Referer: `${this.baseUrl}/${username}/'`,
                'x-instagram-gis': await this.getGis(`/${username}/`)
            }
        });
        const data: any = await res.json();
        return data.graphql.user;
    }

    private async getSharedData(url = '/') {
        return this.fetch(url)
            .then((res) => res.text())
            .then((html) => html.split('window._sharedData = ')[1].split(';</script>')[0])
            .then((_sharedData) => JSON.parse(_sharedData));
    }

    private async getGis(path: string) {
        const { rhx_gis } = this.sharedData || (await this.getSharedData(path));

        return crypto.createHash('md5').update(`${rhx_gis}:${path}`).digest('hex');
    }

    private async fetch(
        path: string,
        { method, headers, body }: { method: string; headers?: any; body?: any } = {
            method: 'GET',
            headers: {},
            body: {}
        }
    ) {
        const options = {
            method,
            headers: {
                'User-Agent': this.userAgent,
                'Accept-Language': 'en-US',
                'X-Instagram-AJAX': '1',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': this.csrftoken || '',
                Referer: this.baseUrl,
                ...headers
            }
        };

        if (method !== 'GET') Object.assign(options, { body });

        const res = await fetch(`${this.baseUrl}${path}`, options);

        return res;
    }

    private get encPassword() {
        return `#PWD_INSTAGRAM_BROWSER:0:${Date.now()}:${this.credentials.password}`;
    }
}

export { Client };
