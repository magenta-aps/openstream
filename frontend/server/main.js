import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import { createServer as createViteServer } from 'vite'

const app = express()
const PORT = process.env.PORT || 4174

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FRONTEND_ROOT = path.join(__dirname, '..')
const DIST_PATH = path.join(FRONTEND_ROOT, 'dist')
const PAGES_PATH = path.join(FRONTEND_ROOT, 'src', 'pages')
const isProd = process.env.NODE_ENV === 'production'

const serializeForInlineScript = (value) => JSON.stringify(value).replace(/</g, '\\u003c')

const injectContext = (html, context) => {
    const payload = {
        orgName: context.orgName ?? null,
        subOrg: context.subOrg ?? null,
        branch: context.branch ?? null
    }

    const scriptContent = [
        `window.OPENSTREAM_CONTEXT = ${serializeForInlineScript(payload)};`,
        'if (window.OPENSTREAM_CONTEXT.orgName) window.ORG_NAME = window.OPENSTREAM_CONTEXT.orgName;',
        'if (window.OPENSTREAM_CONTEXT.subOrg) window.SUB_ORG = window.OPENSTREAM_CONTEXT.subOrg;',
        'if (window.OPENSTREAM_CONTEXT.branch) window.BRANCH = window.OPENSTREAM_CONTEXT.branch;',
        'console.log("org name: " + (window.ORG_NAME || "none") + ", sub org: " + (window.SUB_ORG || "none") + ", branch: " + (window.BRANCH || "none"));'
    ].join('')

    const script = `<script>${scriptContent}</script>`

    if (html.includes('</head>')) {
        return html.replace('</head>', `${script}</head>`)
    }

    return `${script}${html}`
}

const isAssetRequest = (pathname) => {
    const ext = path.extname(pathname)

    if (!ext) {
        return false
    }

    return ext !== '.html'
}

const decodeSegment = (segment) => decodeURIComponent(segment)

const parsePageContext = (pathname) => {
    const segments = pathname.split('/').filter(Boolean)

    if (segments.length < 2) {
        return null
    }

    const decoded = segments.map(decodeSegment)
    const [orgName, ...rest] = decoded

    if (!orgName) {
        return null
    }

    const page = rest.pop()

    if (!page || page.includes('.')) {
        return null
    }

    if (rest.length % 2 !== 0) {
        return null
    }

    const context = { orgName, page }

    for (let index = 0; index < rest.length; index += 2) {
        const key = rest[index].toLowerCase()
        const value = rest[index + 1]

        if (!value || value.includes('.')) {
            return null
        }

        if (key === 'suborg') {
            context.subOrg = value
        } else if (key === 'branch') {
            context.branch = value
        } else {
            return null
        }
    }

    return context
}

const createPageLoader = (viteServer) => {
    return async (pageSlug) => {
        const cleanSlug = pageSlug.replace(/\.html$/, '')

        if (isProd) {
            const filePath = path.join(DIST_PATH, `${cleanSlug}.html`)
            return fs.readFile(filePath, 'utf8')
        }

        const templatePath = path.join(PAGES_PATH, `${cleanSlug}.hbs`)
        const rawTemplate = await fs.readFile(templatePath, 'utf8')
        const virtualUrl = `/src/pages/${cleanSlug}.hbs.html`

        return viteServer.transformIndexHtml(virtualUrl, rawTemplate)
    }
}

const start = async () => {
    let viteServer

    app.use((req, res, next) => {
        if (req.method !== 'GET') {
            return next()
        }

        const pathname = req.path
        const allowedPrefixes = ['/assets', '/@vite', '/@id', '/@fs', '/node_modules', '/favicon', '/openstream_logo', '/public']

        if (allowedPrefixes.some(prefix => pathname.startsWith(prefix))) {
            return next()
        }

        if (isAssetRequest(pathname)) {
            return next()
        }

        const segments = pathname.split('/').filter(Boolean)

        // Allow /sign-in, /select-organisation, /connect-screen, and /open-screen without org name
        if (segments.length === 1 && !segments[0].includes('.')) {
            const page = segments[0]
            
            if (page === 'sign-in' || page === 'select-organisation' || page === 'connect-screen' || page === 'open-screen') {
                req.pageContext = { orgName: null, page }
                return next()
            }

            const rawOrgName = page
            const orgName = decodeSegment(rawOrgName)

            if (orgName) {
                const queryIndex = req.originalUrl.indexOf('?')
                const queryString = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : ''
                return res.redirect(302, `/${encodeURIComponent(orgName)}/sign-in${queryString}`)
            }
        }

        const pageContext = parsePageContext(pathname)

        if (pageContext) {
            req.pageContext = pageContext
            return next()
        }

        res.status(404).send('Not Found')
    })

    if (isProd) {
        app.use(express.static(DIST_PATH))
    } else {
        viteServer = await createViteServer({
            root: FRONTEND_ROOT,
            configFile: path.join(FRONTEND_ROOT, 'vite.config.js'),
            server: {
                middlewareMode: true
            },
            appType: 'custom'
        })
    }

    const loadPage = createPageLoader(viteServer)

    app.get(/.*/, async (req, res, next) => {
        if (!req.route) {
            return next()
        }

        const pageContext = req.pageContext

        if (!pageContext) {
            return next()
        }

        try {
            let html = await loadPage(pageContext.page)
            html = injectContext(html, pageContext)

            res.setHeader('Content-Type', 'text/html')
            res.send(html)
        } catch (error) {
            if (error.code === 'ENOENT') {
                return next()
            }

            if (viteServer) {
                viteServer.ssrFixStacktrace(error)
            }

            console.error(`Error serving page '${pageContext.page}' for org '${pageContext.orgName}':`, error)
            res.status(500).send('Error loading page')
        }
    })

    if (!isProd && viteServer) {
        app.use(viteServer.middlewares)
    }

    app.listen(PORT, () => {
        console.log(`Server listening at http://localhost:${PORT}`)
        console.log(`Try accessing: http://localhost:${PORT}/acme-corp/sign-in (serves modified Handlebars template)`) 
    })
}

start().catch((error) => {
    console.error('Failed to start server:', error)
    process.exit(1)
})