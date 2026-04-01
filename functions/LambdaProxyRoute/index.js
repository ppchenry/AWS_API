const axios = require('axios');

// AWS Lambda handler
exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));

    // Get the origin header to determine which environment is calling
    const origin = event.headers?.origin || event.headers?.Origin || '';
    console.log("ORIGIN:", origin)

    // Determine which API base to use based on the origin
    let AWS_API_BASE;
    const AWS_API_KEY = process.env.AWS_API_KEY;

    // Check if request is from localhost (development)
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        // Use dev environment
        AWS_API_BASE = process.env.AWS_API_BASE_DEV;
        console.log('Using DEV environment:', AWS_API_BASE);
    } else {
        // Use production environment
        AWS_API_BASE = process.env.AWS_API_BASE_PROD;
        console.log('Using PRODUCTION environment:', AWS_API_BASE);
    }

    const allowedOrigins = process.env.ALLOWED_ORIGINS
        .split(",")
        .map(o => o.trim());

    // CORS headers - allow all origins for testing
    const corsHeaders = {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, X-Api-Key',
        'Access-Control-Max-Age': '86400',
        "Access-Control-Allow-Credentials": "true", // Enable credentials
    };

    if (origin && allowedOrigins.includes(origin)) {
        corsHeaders["Access-Control-Allow-Origin"] = origin;
    }

    // Handle preflight OPTIONS requests
    const method = event.requestContext?.http?.method || event.httpMethod;
    if (method === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: corsHeaders,
            body: ''
        };
    }

    try {
        // Extract path (remove /api prefix if present)
        let path = event.rawPath || event.requestContext.http.path;
        if (path.startsWith('/api')) {
            path = path.substring(4);
        }

        // Parse body
        let body = null;
        if (event.body) {
            // Check if body is base64 encoded (common for binary/multipart data)
            if (event.isBase64Encoded) {
                // Keep as base64 string for now, will handle based on content type
                body = event.body;
            } else {
                try {
                    body = JSON.parse(event.body);
                } catch (e) {
                    body = event.body;
                }
            }
        }

        // Prepare headers
        const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
        const authorization = event.headers['authorization'] || event.headers['Authorization'] || '';
        // Extract cookies
        let cookie = '';
        if (event.cookies && Array.isArray(event.cookies) && event.cookies.length > 0) {
            cookie = event.cookies.join('; ');
        } else if (event.headers['cookie'] || event.headers['Cookie']) {
            cookie = event.headers['cookie'] || event.headers['Cookie'];
        }

        const requestHeaders = {
            'X-Api-Key': AWS_API_KEY,  // AWS API Gateway requires lowercase
            'Accept': 'application/json'
        };

        // Add content-type if present
        if (contentType) {
            requestHeaders['Content-Type'] = contentType;
        }

        // Add authorization if present (JWT token)
        if (authorization) {
            requestHeaders['Authorization'] = authorization;
        }

        // CRITICAL: Forward Cookie header for refresh token and session cookies
        if (cookie) {
            requestHeaders['Cookie'] = cookie;
        } else {
            console.log('NO COOKIES found in event.cookies or headers');
        }

        // Forward origin header to backend
        if (origin) {
            requestHeaders['origin'] = origin;
        }

        // Build full URL
        const targetUrl = `${AWS_API_BASE}${path}`;

        // Add query parameters if any
        let fullUrl = targetUrl;
        if (event.rawQueryString) {
            fullUrl = `${targetUrl}?${event.rawQueryString}`;
        }

        console.log(`Proxying ${method} ${fullUrl}`);

        // Make request to AWS API Gateway
        const axiosConfig = {
            method: method.toLowerCase(),
            url: fullUrl,
            headers: requestHeaders,
            validateStatus: () => true // Accept any status code
        };

        // Handle multipart/form-data differently
        if (contentType.includes('multipart/form-data')) {
            // For multipart, we need to handle base64 encoded body properly
            let bodyData;
            if (event.isBase64Encoded) {
                // Decode base64 string back to Buffer
                bodyData = Buffer.from(body, 'base64');
            } else {
                // Body is already in correct format
                bodyData = typeof body === 'string' ? Buffer.from(body) : body;
            }

            axiosConfig.data = bodyData;
            axiosConfig.maxBodyLength = Infinity;
            axiosConfig.maxContentLength = Infinity;

            // CRITICAL: Preserve the exact Content-Type including boundary
            requestHeaders['Content-Type'] = contentType;

            // Log for debugging
            console.log('Multipart request:', {
                isBase64Encoded: event.isBase64Encoded,
                bodyLength: bodyData.length,
                contentType: contentType,
                boundary: contentType.match(/boundary=([^;]+)/)?.[1]
            });
        } else if (body) {
            axiosConfig.data = body;
        }

        const response = await axios(axiosConfig);

        console.log(`Response status: ${response.status}`);

        // Log response details for debugging
        if (response.status >= 400) {
            console.error('Backend error response:', {
                status: response.status,
                data: response.data,
                headers: response.headers
            });
        }

        // Extract Set-Cookie headers (can be array or single value)
        let setCookieHeaders = response.headers['set-cookie'];

        // Modify cookie flags based on origin (localhost = HTTP, production = HTTPS)
        if (setCookieHeaders) {
            const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');

            // Convert to array for consistent processing
            const cookieArray = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

            // Modify each cookie to match the environment
            setCookieHeaders = cookieArray.map(cookie => {
                // CRITICAL: Remove Domain attribute so cookie defaults to proxy's domain
                let modifiedCookie = cookie.replace(/;\s*Domain=[^;]*/gi, '');

                if (isLocalhost) {
                    // For HTTP localhost: Remove Secure and SameSite=None flags
                    modifiedCookie = modifiedCookie
                        .replace(/;\s*Secure/gi, '')
                        .replace(/;\s*SameSite=None/gi, '');
                } else {
                    // For HTTPS production: Ensure Secure and SameSite=None are present
                    if (!modifiedCookie.includes('Secure')) {
                        modifiedCookie += '; Secure';
                    }
                    if (!modifiedCookie.includes('SameSite')) {
                        modifiedCookie += '; SameSite=None';
                    }
                }
                return modifiedCookie;
            });

        }

        // Build response object with CORS headers
        const lambdaResponse = {
            statusCode: response.status,
            headers: {
                ...corsHeaders,
                'Content-Type': response.headers['content-type'] || 'application/json'
            },
            body: typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
        };

        // Add Set-Cookie headers if present
        // HTTP API v2 supports a 'cookies' array for setting cookies
        if (setCookieHeaders) {
            lambdaResponse.cookies = setCookieHeaders;
            console.log('Cookies added to response:', lambdaResponse.cookies);
        }

        return lambdaResponse;

    } catch (error) {
        console.error('Proxy error:', error.message);
        console.error('Error details:', error.response?.data || error);
        console.error('Request config:', {
            method: error.config?.method,
            url: error.config?.url,
            headers: error.config?.headers
        });

        // ALWAYS return CORS headers even on error
        return {
            statusCode: error.response?.status || 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Proxy request failed',
                message: error.message,
                details: error.response?.data || null
            })
        };
    }
};
