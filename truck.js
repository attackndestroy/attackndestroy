(function () {
    "use strict";

    /*
     * ============================================================
     * ATT/DES ANALYTICS TRACKER
     * ============================================================
     *
     * Project ID:
     * 6a864872000d5c2e73fa
     *
     * Database ID:
     * 6a864b5700077b69880f
     *
     * Tables:
     * events
     * sessions
     *
     * This script does NOT contain an API key.
     * ============================================================
     */


    const CONFIG = {

        endpoint:
            "https://fra.cloud.appwrite.io/v1",

        projectId:
            "6a864872000d5c2e73fa",

        databaseId:
            "6a864b5700077b69880f",

        eventsTable:
            "events",

        sessionsTable:
            "sessions",

        rootDomain:
            "attdes.online",

        sessionTimeout:
            30 * 60 * 1000,

        pingInterval:
            30 * 1000,

        flushInterval:
            3 * 1000,

        batchSize:
            10,

        maxQueue:
            100,

        retryDelay:
            5 * 1000,

        debug:
            true,

        maxEventData:
            8000
    };


    /*
     * ============================================================
     * STORAGE KEYS
     * ============================================================
     */

    const PREFIX =
        "attdes_analytics_";


    const VISITOR_KEY =
        PREFIX + "visitor_id";


    const SESSION_KEY =
        PREFIX + "session_id";


    const SESSION_START_KEY =
        PREFIX + "session_start";


    const SESSION_CREATED_KEY =
        PREFIX + "session_created";


    const SESSION_ROW_KEY =
        PREFIX + "session_row_id";


    const QUEUE_KEY =
        PREFIX + "queue";


    /*
     * ============================================================
     * STATE
     * ============================================================
     */

    let started = false;

    let flushing = false;

    let queue = [];

    let visitorId = null;

    let sessionId = null;

    let sessionStart = 0;

    let sessionRowId = null;

    let isNewVisitor = false;

    let flushTimer = null;

    let pingTimer = null;

    let currentPageStart =
        Date.now();

    let pageVisible =
        document.visibilityState === "visible";

    let lastUrl =
        location.href;


    /*
     * ============================================================
     * DEBUG
     * ============================================================
     */

    function log() {

        if (!CONFIG.debug) {
            return;
        }

        try {

            console.log(
                "[ATT/DES Analytics]",
                ...arguments
            );

        } catch {}
    }


    function warn() {

        if (!CONFIG.debug) {
            return;
        }

        try {

            console.warn(
                "[ATT/DES Analytics]",
                ...arguments
            );

        } catch {}
    }


    function errorLog() {

        try {

            console.error(
                "[ATT/DES Analytics]",
                ...arguments
            );

        } catch {}
    }


    /*
     * ============================================================
     * SAFE STORAGE
     * ============================================================
     */

    function storageGet(
        storage,
        key
    ) {

        try {

            return storage.getItem(
                key
            );

        } catch {

            return null;
        }
    }


    function storageSet(
        storage,
        key,
        value
    ) {

        try {

            storage.setItem(
                key,
                value
            );

            return true;

        } catch {

            return false;
        }
    }


    function storageRemove(
        storage,
        key
    ) {

        try {

            storage.removeItem(
                key
            );

        } catch {}
    }


    /*
     * ============================================================
     * ID GENERATORS
     * ============================================================
     */

    function randomId(
        prefix
    ) {

        if (
            window.crypto &&
            typeof window.crypto.randomUUID ===
                "function"
        ) {

            return (
                prefix +
                "_" +
                window.crypto.randomUUID()
            );
        }


        if (
            window.crypto &&
            typeof window.crypto.getRandomValues ===
                "function"
        ) {

            const bytes =
                new Uint8Array(16);


            window.crypto.getRandomValues(
                bytes
            );


            let value = "";


            for (
                let i = 0;
                i < bytes.length;
                i++
            ) {

                value +=
                    bytes[i]
                        .toString(16)
                        .padStart(2, "0");
            }


            return (
                prefix +
                "_" +
                value
            );
        }


        return (
            prefix +
            "_" +
            Date.now().toString(36) +
            "_" +
            Math.random()
                .toString(36)
                .slice(2)
        );
    }


    /*
     * Appwrite custom Row IDs should stay short.
     */

    function rowId() {

        const chars =
            "abcdefghijklmnopqrstuvwxyz" +
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
            "0123456789";


        let result = "";


        if (
            window.crypto &&
            typeof window.crypto.getRandomValues ===
                "function"
        ) {

            const bytes =
                new Uint8Array(20);


            window.crypto.getRandomValues(
                bytes
            );


            for (
                let i = 0;
                i < bytes.length;
                i++
            ) {

                result +=
                    chars[
                        bytes[i] %
                        chars.length
                    ];
            }


            return result;
        }


        for (
            let i = 0;
            i < 20;
            i++
        ) {

            result +=
                chars[
                    Math.floor(
                        Math.random() *
                        chars.length
                    )
                ];
        }


        return result;
    }


    /*
     * ============================================================
     * CLEAN
     * ============================================================
     */

    function clean(
        value,
        max
    ) {

        if (
            value === null ||
            value === undefined
        ) {

            return null;
        }


        const result =
            String(value).trim();


        if (!result) {
            return null;
        }


        return result.slice(
            0,
            max
        );
    }


    /*
     * ============================================================
     * HOST
     * ============================================================
     */

    function validHost() {

        const host =
            location.hostname
                .toLowerCase()
                .replace(/\.$/, "");


        const root =
            CONFIG.rootDomain
                .toLowerCase()
                .replace(/\.$/, "");


        return (
            host === root ||
            host.endsWith(
                "." + root
            )
        );
    }


    function currentSite() {

        return clean(
            location.hostname
                .toLowerCase()
                .replace(/\.$/, ""),
            36
        );
    }


    /*
     * ============================================================
     * QUERY PARAMETERS
     * ============================================================
     */

    function query(
        name,
        max
    ) {

        try {

            return clean(
                new URLSearchParams(
                    location.search
                ).get(name),
                max
            );

        } catch {

            return null;
        }
    }


    /*
     * ============================================================
     * VISITOR
     * ============================================================
     */

    function getVisitor() {

        let value =
            storageGet(
                localStorage,
                VISITOR_KEY
            );


        if (value) {

            isNewVisitor = false;

            return value;
        }


        value =
            randomId(
                "visitor"
            );


        storageSet(
            localStorage,
            VISITOR_KEY,
            value
        );


        isNewVisitor = true;


        return value;
    }


    /*
     * ============================================================
     * SESSION
     * ============================================================
     */

    function getSession() {

        let id =
            storageGet(
                sessionStorage,
                SESSION_KEY
            );


        let start =
            Number(
                storageGet(
                    sessionStorage,
                    SESSION_START_KEY
                )
            );


        const now =
            Date.now();


        if (
            !id ||
            !start ||
            now - start >
                CONFIG.sessionTimeout
        ) {

            id =
                randomId(
                    "session"
                );


            start =
                now;


            storageSet(
                sessionStorage,
                SESSION_KEY,
                id
            );


            storageSet(
                sessionStorage,
                SESSION_START_KEY,
                String(start)
            );


            storageRemove(
                sessionStorage,
                SESSION_CREATED_KEY
            );


            storageRemove(
                sessionStorage,
                SESSION_ROW_KEY
            );
        }


        return {

            id:
                id,

            start:
                start
        };
    }


    /*
     * ============================================================
     * DEVICE
     * ============================================================
     */

    function getDevice() {

        const ua =
            navigator.userAgent || "";


        const width =
            Math.max(
                document.documentElement
                    .clientWidth || 0,

                window.innerWidth || 0
            );


        if (
            /ipad|tablet/i.test(ua) ||
            (
                width >= 600 &&
                width <= 1200
            )
        ) {

            return "tablet";
        }


        if (
            /mobile|android|iphone|ipod|windows phone/i
                .test(ua)
        ) {

            return "mobile";
        }


        return "desktop";
    }


    /*
     * ============================================================
     * OPERATING SYSTEM
     * ============================================================
     */

    function getOS() {

        const ua =
            navigator.userAgent || "";


        if (
            /Windows NT/i.test(ua)
        ) {

            return "Windows";
        }


        if (
            /Android/i.test(ua)
        ) {

            return "Android";
        }


        if (
            /iPhone|iPad|iPod/i.test(ua)
        ) {

            return "iOS";
        }


        if (
            /Mac OS X/i.test(ua)
        ) {

            return "macOS";
        }


        if (
            /CrOS/i.test(ua)
        ) {

            return "ChromeOS";
        }


        if (
            /Linux/i.test(ua)
        ) {

            return "Linux";
        }


        return "Unknown";
    }


    /*
     * ============================================================
     * BROWSER
     * ============================================================
     */

    function getBrowser() {

        const ua =
            navigator.userAgent || "";


        if (
            /Edg\//i.test(ua)
        ) {

            return "Edge";
        }


        if (
            /OPR\//i.test(ua)
        ) {

            return "Opera";
        }


        if (
            /Firefox\//i.test(ua)
        ) {

            return "Firefox";
        }


        if (
            /Chrome\//i.test(ua)
        ) {

            return "Chrome";
        }


        if (
            /Safari\//i.test(ua)
        ) {

            return "Safari";
        }


        return "Unknown";
    }


    /*
     * ============================================================
     * MARKETING
     * ============================================================
     */

    function getMarketing() {

        return {

            referrer:
                clean(
                    document.referrer,
                    512
                ),

            utm_source:
                query(
                    "utm_source",
                    128
                ),

            utm_medium:
                query(
                    "utm_medium",
                    128
                ),

            utm_campaign:
                query(
                    "utm_campaign",
                    128
                ),

            utm_term:
                query(
                    "utm_term",
                    128
                ),

            utm_content:
                query(
                    "utm_content",
                    128
                )
        };
    }


    /*
     * ============================================================
     * SCREEN
     * ============================================================
     */

    function getScreen() {

        return {

            width:
                screen.width || null,

            height:
                screen.height || null,

            availWidth:
                screen.availWidth || null,

            availHeight:
                screen.availHeight || null,

            viewportWidth:
                window.innerWidth || null,

            viewportHeight:
                window.innerHeight || null,

            pixelRatio:
                window.devicePixelRatio ||
                1,

            orientation:
                screen.orientation
                    ? screen.orientation.type
                    : null
        };
    }


    /*
     * ============================================================
     * NETWORK
     * ============================================================
     */

    function getNetwork() {

        const connection =
            navigator.connection ||
            navigator.mozConnection ||
            navigator.webkitConnection;


        if (!connection) {
            return null;
        }


        return {

            effectiveType:
                connection.effectiveType ||
                null,

            downlink:
                typeof connection.downlink ===
                "number"
                    ? connection.downlink
                    : null,

            rtt:
                typeof connection.rtt ===
                "number"
                    ? connection.rtt
                    : null,

            saveData:
                typeof connection.saveData ===
                "boolean"
                    ? connection.saveData
                    : null
        };
    }


    /*
     * ============================================================
     * CAPABILITIES
     * ============================================================
     */

    function getCapabilities() {

        return {

            online:
                navigator.onLine,

            cookies:
                navigator.cookieEnabled,

            touch:
                "ontouchstart" in window ||
                navigator.maxTouchPoints > 0,

            maxTouchPoints:
                navigator.maxTouchPoints ||
                0,

            hardwareConcurrency:
                navigator.hardwareConcurrency ||
                null,

            deviceMemory:
                navigator.deviceMemory ||
                null,

            languages:
                Array.isArray(
                    navigator.languages
                )
                    ? navigator.languages
                    : []
        };
    }


    /*
     * ============================================================
     * TIMEZONE
     * ============================================================
     */

    function getTimezone() {

        try {

            return {

                timezone:
                    Intl.DateTimeFormat()
                        .resolvedOptions()
                        .timeZone ||
                    null,

                offsetMinutes:
                    new Date()
                        .getTimezoneOffset()
            };

        } catch {

            return null;
        }
    }


    /*
     * ============================================================
     * PAGE DATA
     * ============================================================
     */

    function getPageData() {

        return {

            url:
                clean(
                    location.href,
                    2048
                ),

            path:
                clean(
                    location.pathname,
                    1024
                ),

            title:
                clean(
                    document.title,
                    255
                ),

            referrer:
                clean(
                    document.referrer,
                    512
                )
        };
    }


    /*
     * ============================================================
     * CLIENT INFORMATION
     * ============================================================
     */

    function getClientInfo() {

        return {

            visitor_id:
                visitorId,

            session_id:
                sessionId,

            device:
                getDevice(),

            os:
                getOS(),

            browser:
                getBrowser(),

            language:
                navigator.language ||
                null,

            languages:
                Array.isArray(
                    navigator.languages
                )
                    ? navigator.languages
                    : [],

            timezone:
                getTimezone(),

            screen:
                getScreen(),

            network:
                getNetwork(),

            capabilities:
                getCapabilities(),

            page:
                getPageData(),

            marketing:
                getMarketing(),

            timestamp:
                new Date()
                    .toISOString()
        };
    }


    /*
     * ============================================================
     * QUEUE
     * ============================================================
     */

    function saveQueue() {

        try {

            storageSet(
                localStorage,
                QUEUE_KEY,
                JSON.stringify(
                    queue.slice(
                        -CONFIG.maxQueue
                    )
                )
            );

        } catch {}
    }


    function loadQueue() {

        try {

            const saved =
                storageGet(
                    localStorage,
                    QUEUE_KEY
                );


            if (!saved) {

                queue = [];

                return;
            }


            const parsed =
                JSON.parse(saved);


            queue =
                Array.isArray(parsed)
                    ? parsed.slice(
                        -CONFIG.maxQueue
                    )
                    : [];

        } catch {

            queue = [];
        }
    }


    /*
     * ============================================================
     * APPWRITE REST
     * ============================================================
     */

    async function appwriteRequest(
        method,
        path,
        body,
        keepalive
    ) {

        const url =
            CONFIG.endpoint +
            path;


        const options = {

            method:
                method,

            headers: {

                "Content-Type":
                    "application/json",

                "X-Appwrite-Project":
                    CONFIG.projectId
            },

            credentials:
                "omit"
        };


        if (
            body !== undefined &&
            body !== null
        ) {

            options.body =
                JSON.stringify(
                    body
                );
        }


        if (keepalive) {

            options.keepalive =
                true;
        }


        let response;


        try {

            response =
                await fetch(
                    url,
                    options
                );

        } catch (error) {

            errorLog(
                "Network error:",
                error
            );

            throw error;
        }


        let text = "";


        try {

            text =
                await response.text();

        } catch {}


        if (!response.ok) {

            const message =
                "HTTP " +
                response.status +
                " " +
                response.statusText +
                " | " +
                text;


            errorLog(
                "Appwrite error:",
                message
            );


            throw new Error(
                message
            );
        }


        if (!text) {

            return null;
        }


        try {

            return JSON.parse(
                text
            );

        } catch {

            return text;
        }
    }


    /*
     * ============================================================
     * CREATE EVENT
     * ============================================================
     */

    async function createEvent(
        event,
        keepalive
    ) {

        return appwriteRequest(

            "POST",

            "/tablesdb/" +
                encodeURIComponent(
                    CONFIG.databaseId
                ) +
                "/tables/" +
                encodeURIComponent(
                    CONFIG.eventsTable
                ) +
                "/rows",

            {

                rowId:
                    rowId(),

                data:
                    event
            },

            keepalive
        );
    }


    /*
     * ============================================================
     * CREATE SESSION
     * ============================================================
     */

    async function createSession() {

        const alreadyCreated =
            storageGet(
                sessionStorage,
                SESSION_CREATED_KEY
            );


        if (alreadyCreated) {

            sessionRowId =
                storageGet(
                    sessionStorage,
                    SESSION_ROW_KEY
                );


            return true;
        }


        const marketing =
            getMarketing();


        const data = {

            session_id:
                sessionId,

            site_id:
                currentSite(),

            visitor_id:
                visitorId,

            is_new:
                isNewVisitor,

            device:
                getDevice(),

            os:
                getOS(),

            browser:
                getBrowser(),

            language:
                clean(
                    navigator.language ||
                    "unknown",
                    100
                ),

            country:
                null,

            referrer:
                marketing.referrer,

            utm_source:
                marketing.utm_source,

            utm_medium:
                marketing.utm_medium,

            utm_campaign:
                marketing.utm_campaign,

            duration:
                0,

            last_ping:
                new Date()
                    .toISOString()
        };


        /*
         * The custom Row ID is short enough for Appwrite.
         */

        const newRowId =
            rowId();


        try {

            await appwriteRequest(

                "POST",

                "/tablesdb/" +
                    encodeURIComponent(
                        CONFIG.databaseId
                    ) +
                    "/tables/" +
                    encodeURIComponent(
                        CONFIG.sessionsTable
                    ) +
                    "/rows",

                {

                    rowId:
                        newRowId,

                    data:
                        data
                },

                false
            );


            sessionRowId =
                newRowId;


            storageSet(
                sessionStorage,
                SESSION_ROW_KEY,
                sessionRowId
            );


            storageSet(
                sessionStorage,
                SESSION_CREATED_KEY,
                "1"
            );


            log(
                "Session created successfully."
            );


            return true;

        } catch (error) {

            errorLog(
                "Session creation failed:",
                error
            );


            return false;
        }
    }


    /*
     * ============================================================
     * UPDATE SESSION
     * ============================================================
     */

    async function updateSession() {

        if (!sessionRowId) {
            return;
        }


        const duration =
            Math.max(
                0,
                Math.floor(
                    (
                        Date.now() -
                        sessionStart
                    ) / 1000
                )
            );


        try {

            await appwriteRequest(

                "PATCH",

                "/tablesdb/" +
                    encodeURIComponent(
                        CONFIG.databaseId
                    ) +
                    "/tables/" +
                    encodeURIComponent(
                        CONFIG.sessionsTable
                    ) +
                    "/rows/" +
                    encodeURIComponent(
                        sessionRowId
                    ),

                {

                    data: {

                        duration:
                            duration,

                        last_ping:
                            new Date()
                                .toISOString()
                    }

                },

                false
            );


            log(
                "Session updated:",
                duration + " seconds"
            );


        } catch (error) {

            warn(
                "Session update failed:",
                error
            );
        }
    }


    /*
     * ============================================================
     * ADD EVENT
     * ============================================================
     */

    function addEvent(
        type,
        label,
        metadata
    ) {

        if (!started) {
            return;
        }


        let targetLabel;


        const payload = {

            label:
                clean(
                    label,
                    255
                ),

            metadata:
                metadata || {},

            recorded_at:
                new Date()
                    .toISOString()
        };


        try {

            targetLabel =
                JSON.stringify(
                    payload
                );

        } catch {

            targetLabel =
                JSON.stringify({
                    label:
                        clean(
                            label,
                            255
                        )
                });
        }


        targetLabel =
            clean(
                targetLabel,
                CONFIG.maxEventData
            );


        const event = {

            site_id:
                currentSite(),

            session_id:
                sessionId,

            event_type:
                clean(
                    type,
                    32
                ),

            page_url:
                clean(
                    location.href,
                    2048
                ),

            page_title:
                clean(
                    document.title,
                    255
                ),

            target_label:
                targetLabel
        };


        queue.push(
            event
        );


        if (
            queue.length >
            CONFIG.maxQueue
        ) {

            queue =
                queue.slice(
                    -CONFIG.maxQueue
                );
        }


        saveQueue();


        if (
            queue.length >=
            CONFIG.batchSize
        ) {

            flush(
                false
            );
        }
    }


    /*
     * ============================================================
     * FLUSH
     * ============================================================
     */

    async function flush(
        keepalive
    ) {

        if (
            flushing ||
            !queue.length
        ) {

            return;
        }


        flushing = true;


        const batch =
            queue.splice(
                0,
                CONFIG.batchSize
            );


        saveQueue();


        const failed = [];


        for (
            const event of batch
        ) {

            try {

                await createEvent(
                    event,
                    keepalive
                );


                log(
                    "Event sent:",
                    event.event_type
                );

            } catch (error) {

                failed.push(
                    event
                );


                errorLog(
                    "Event failed:",
                    error
                );
            }
        }


        if (failed.length) {

            queue =
                failed
                    .concat(queue)
                    .slice(
                        -CONFIG.maxQueue
                    );


            saveQueue();


            if (!keepalive) {

                setTimeout(
                    function () {

                        flush(
                            false
                        );

                    },
                    CONFIG.retryDelay
                );
            }
        }


        flushing = false;
    }


    /*
     * ============================================================
     * CLICK LABEL
     * ============================================================
     */

    function getLabel(
        element
    ) {

        return clean(

            element.getAttribute(
                "data-analytics-label"
            ) ||

            element.getAttribute(
                "aria-label"
            ) ||

            element.getAttribute(
                "download"
            ) ||

            element.innerText ||

            element.textContent ||

            "",

            255
        );
    }


    /*
     * ============================================================
     * DOWNLOAD DETECTION
     * ============================================================
     */

    function isDownload(
        element
    ) {

        if (
            element.hasAttribute(
                "download"
            )
        ) {

            return true;
        }


        const href =
            element.getAttribute(
                "href"
            );


        if (!href) {

            return false;
        }


        return /\.(zip|rar|7z|apk|mcpack|mcaddon|mcworld|mctemplate|pdf|exe|msi)(?:[?#].*)?$/i
            .test(
                href
            );
    }


    /*
     * ============================================================
     * CLICK TRACKING
     * ============================================================
     */

    function clickHandler(
        event
    ) {

        let element =
            event.target;


        while (
            element &&
            element !== document &&
            element.tagName !== "A" &&
            element.tagName !== "BUTTON"
        ) {

            element =
                element.parentElement;
        }


        if (!element) {

            return;
        }


        const href =
            element.tagName === "A"
                ? element.getAttribute(
                    "href"
                )
                : null;


        const download =
            isDownload(
                element
            );


        let external =
            false;


        try {

            if (href) {

                const absolute =
                    new URL(
                        href,
                        location.href
                    );


                external =
                    absolute.hostname !==
                    location.hostname;
            }

        } catch {}


        addEvent(

            download
                ? "download"
                : "click",

            getLabel(
                element
            ),

            {

                tag:
                    element.tagName,

                href:
                    clean(
                        href,
                        2048
                    ),

                external:
                    external
            }
        );
    }


    /*
     * ============================================================
     * PAGEVIEW
     * ============================================================
     */

    function pageView() {

        currentPageStart =
            Date.now();


        addEvent(

            "pageview",

            null,

            getClientInfo()
        );


        flush(
            false
        );
    }


    /*
     * ============================================================
     * PAGE DURATION
     * ============================================================
     */

    function pageDuration() {

        const seconds =
            Math.max(
                0,
                Math.floor(
                    (
                        Date.now() -
                        currentPageStart
                    ) / 1000
                )
            );


        addEvent(

            "page_duration",

            null,

            {

                seconds:
                    seconds
            }
        );
    }


    /*
     * ============================================================
     * SESSION PING
     * ============================================================
     */

    function ping() {

        if (!started) {

            return;
        }


        addEvent(

            "session_ping",

            null,

            {

                sessionDuration:
                    Math.floor(
                        (
                            Date.now() -
                            sessionStart
                        ) / 1000
                    ),

                pageVisible:
                    pageVisible,

                online:
                    navigator.onLine
            }
        );


        flush(
            false
        );


        updateSession();
    }


    /*
     * ============================================================
     * VISIBILITY
     * ============================================================
     */

    function visibilityHandler() {

        pageVisible =
            document.visibilityState ===
            "visible";


        if (pageVisible) {

            addEvent(

                "visibility",

                "visible",

                {}
            );


            flush(
                false
            );

        } else {

            pageDuration();


            addEvent(

                "visibility",

                "hidden",

                {}
            );


            flush(
                true
            );


            updateSession();
        }
    }


    /*
     * ============================================================
     * ONLINE / OFFLINE
     * ============================================================
     */

    function onlineHandler() {

        addEvent(
            "network",
            "online",
            {}
        );


        flush(
            false
        );
    }


    function offlineHandler() {

        addEvent(
            "network",
            "offline",
            {}
        );


        saveQueue();
    }


    /*
     * ============================================================
     * JAVASCRIPT ERRORS
     * ============================================================
     */

    function errorHandler(
        event
    ) {

        try {

            addEvent(

                "javascript_error",

                clean(
                    event.message,
                    255
                ),

                {

                    filename:
                        clean(
                            event.filename,
                            2048
                        ),

                    line:
                        event.lineno ||
                        null,

                    column:
                        event.colno ||
                        null
                }
            );

        } catch {}
    }


    /*
     * ============================================================
     * UNHANDLED PROMISE REJECTION
     * ============================================================
     */

    function rejectionHandler(
        event
    ) {

        let reason =
            "Unhandled promise rejection";


        try {

            if (
                event.reason instanceof
                Error
            ) {

                reason =
                    event.reason.message;

            } else {

                reason =
                    String(
                        event.reason
                    );
            }

        } catch {}


        addEvent(

            "promise_error",

            clean(
                reason,
                255
            ),

            {}
        );
    }


    /*
     * ============================================================
     * SPA NAVIGATION
     * ============================================================
     */

    function trackNavigation() {

        const url =
            location.href;


        if (url === lastUrl) {

            return;
        }


        lastUrl =
            url;


        currentPageStart =
            Date.now();


        addEvent(

            "navigation",

            null,

            {

                url:
                    clean(
                        url,
                        2048
                    ),

                path:
                    clean(
                        location.pathname,
                        1024
                    ),

                title:
                    clean(
                        document.title,
                        255
                    )
            }
        );


        flush(
            false
        );
    }


    if (
        typeof history.pushState ===
        "function"
    ) {

        const originalPushState =
            history.pushState;


        history.pushState =
            function () {

                const result =
                    originalPushState.apply(
                        this,
                        arguments
                    );


                setTimeout(
                    trackNavigation,
                    0
                );


                return result;
            };
    }


    if (
        typeof history.replaceState ===
        "function"
    ) {

        const originalReplaceState =
            history.replaceState;


        history.replaceState =
            function () {

                const result =
                    originalReplaceState.apply(
                        this,
                        arguments
                    );


                setTimeout(
                    trackNavigation,
                    0
                );


                return result;
            };
    }


    /*
     * ============================================================
     * PERFORMANCE
     * ============================================================
     */

    function collectPerformance() {

        if (
            !window.performance ||
            !performance.getEntriesByType
        ) {

            return;
        }


        try {

            const navigation =
                performance.getEntriesByType(
                    "navigation"
                )[0];


            if (!navigation) {

                return;
            }


            addEvent(

                "performance",

                null,

                {

                    type:
                        navigation.type,

                    dns:
                        Math.round(
                            navigation.domainLookupEnd -
                            navigation.domainLookupStart
                        ),

                    connection:
                        Math.round(
                            navigation.connectEnd -
                            navigation.connectStart
                        ),

                    request:
                        Math.round(
                            navigation.responseStart -
                            navigation.requestStart
                        ),

                    response:
                        Math.round(
                            navigation.responseEnd -
                            navigation.responseStart
                        ),

                    domInteractive:
                        Math.round(
                            navigation.domInteractive
                        ),

                    domContentLoaded:
                        Math.round(
                            navigation.domContentLoadedEventEnd
                        ),

                    load:
                        Math.round(
                            navigation.loadEventEnd
                        )
                }
            );


        } catch (error) {

            warn(
                "Performance collection failed:",
                error
            );
        }
    }


    /*
     * ============================================================
     * WEB VITALS / PERFORMANCE OBSERVER
     * ============================================================
     */

    function observePerformance() {

        if (
            !window.PerformanceObserver
        ) {

            return;
        }


        /*
         * Largest Contentful Paint
         */

        try {

            const lcpObserver =
                new PerformanceObserver(
                    function (list) {

                        const entries =
                            list.getEntries();


                        const last =
                            entries[
                                entries.length - 1
                            ];


                        if (!last) {

                            return;
                        }


                        addEvent(

                            "web_vital",

                            "LCP",

                            {

                                value:
                                    Math.round(
                                        last.startTime
                                    )
                            }
                        );
                    }
                );


            lcpObserver.observe(
                {
                    type:
                        "largest-contentful-paint",

                    buffered:
                        true
                }
            );

        } catch {}


        /*
         * First Input Delay / Event Timing
         */

        try {

            const eventObserver =
                new PerformanceObserver(
                    function (list) {

                        for (
                            const entry of
                            list.getEntries()
                        ) {

                            if (
                                entry.name ===
                                "pointerdown"
                            ) {

                                continue;
                            }


                            if (
                                typeof entry.processingStart !==
                                "number"
                            ) {

                                continue;
                            }


                            const delay =
                                entry.processingStart -
                                entry.startTime;


                            if (
                                delay < 1
                            ) {

                                continue;
                            }


                            addEvent(

                                "web_vital",

                                "INP_EVENT",

                                {

                                    delay:
                                        Math.round(
                                            delay
                                        ),

                                    duration:
                                        Math.round(
                                            entry.duration
                                        )
                                }
                            );
                        }
                    }
                );


            eventObserver.observe(
                {
                    type:
                        "event",

                    buffered:
                        true,

                    durationThreshold:
                        40
                }
            );

        } catch {}


        /*
         * Layout shifts
         */

        try {

            let clsValue =
                0;


            const clsObserver =
                new PerformanceObserver(
                    function (list) {

                        for (
                            const entry of
                            list.getEntries()
                        ) {

                            if (
                                entry.hadRecentInput
                            ) {

                                continue;
                            }


                            clsValue +=
                                entry.value;
                        }


                        addEvent(

                            "web_vital",

                            "CLS",

                            {

                                value:
                                    Number(
                                        clsValue.toFixed(
                                            4
                                        )
                                    )
                            }
                        );
                    }
                );


            clsObserver.observe(
                {
                    type:
                        "layout-shift",

                    buffered:
                        true
                }
            );

        } catch {}
    }


    /*
     * ============================================================
     * COPY EVENT
     * ============================================================
     *
     * We record only that a copy occurred.
     * We do NOT collect the copied text.
     * ============================================================
     */

    function copyHandler() {

        addEvent(
            "copy",
            null,
            {}
        );
    }


    /*
     * ============================================================
     * START
     * ============================================================
     */

    async function start() {

        if (started) {

            return;
        }


        log(
            "Starting..."
        );


        if (!validHost()) {

            warn(
                "Invalid host:",
                location.hostname
            );


            return;
        }


        loadQueue();


        visitorId =
            getVisitor();


        const session =
            getSession();


        sessionId =
            session.id;


        sessionStart =
            session.start;


        log(
            "Visitor:",
            visitorId
        );


        log(
            "Session:",
            sessionId
        );


        /*
         * Mark started before adding events.
         */

        started = true;


        /*
         * Create session.
         */

        await createSession();


        /*
         * Initial pageview.
         */

        pageView();


        /*
         * Events.
         */

        document.addEventListener(
            "click",
            clickHandler,
            true
        );


        document.addEventListener(
            "visibilitychange",
            visibilityHandler
        );


        document.addEventListener(
            "copy",
            copyHandler,
            true
        );


        window.addEventListener(
            "online",
            onlineHandler
        );


        window.addEventListener(
            "offline",
            offlineHandler
        );


        window.addEventListener(
            "error",
            errorHandler
        );


        window.addEventListener(
            "unhandledrejection",
            rejectionHandler
        );


        window.addEventListener(
            "beforeunload",
            function () {

                pageDuration();

                saveQueue();

                flush(
                    true
                );

                updateSession();
            }
        );


        /*
         * Flush queue.
         */

        flushTimer =
            setInterval(
                function () {

                    flush(
                        false
                    );

                },
                CONFIG.flushInterval
            );


        /*
         * Session heartbeat.
         */

        pingTimer =
            setInterval(
                function () {

                    ping();

                },
                CONFIG.pingInterval
            );


        /*
         * Performance after page load.
         */

        if (
            document.readyState ===
            "complete"
        ) {

            setTimeout(
                function () {

                    collectPerformance();

                    observePerformance();

                    flush(
                        false
                    );

                },
                1000
            );

        } else {

            window.addEventListener(

                "load",

                function () {

                    setTimeout(
                        function () {

                            collectPerformance();

                            observePerformance();

                            flush(
                                false
                            );

                        },
                        1000
                    );

                },

                {
                    once: true
                }
            );
        }


        /*
         * Send any old queued events.
         */

        flush(
            false
        );


        log(
            "ATT/DES Analytics started successfully."
        );
    }


    /*
     * ============================================================
     * PUBLIC API
     * ============================================================
     */

    window.ATTDESTracker = {

        track:
            function (
                type,
                label,
                metadata
            ) {

                addEvent(
                    type,
                    label,
                    metadata
                );


                flush(
                    false
                );
            },


        pageview:
            function () {

                pageView();
            },


        click:
            function (
                label
            ) {

                addEvent(
                    "click",
                    label,
                    {}
                );


                flush(
                    false
                );
            },


        download:
            function (
                label
            ) {

                addEvent(
                    "download",
                    label,
                    {}
                );


                flush(
                    false
                );
            },


        flush:
            function () {

                return flush(
                    false
                );
            },


        status:
            function () {

                return {

                    started:
                        started,

                    visitorId:
                        visitorId,

                    sessionId:
                        sessionId,

                    sessionRowId:
                        sessionRowId,

                    queuedEvents:
                        queue.length,

                    site:
                        currentSite(),

                    page:
                        location.href
                };
            }
    };


    /*
     * ============================================================
     * INITIALIZE
     * ============================================================
     */

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            start,
            {
                once: true
            }
        );

    } else {

        start();
    }

})();