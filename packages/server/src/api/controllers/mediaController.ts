import { Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import https from 'https';
import { URL } from 'url';

const getMediaSchema = z.object({
  url: z.string().url(),
});

/**
 * Proxy media content from Twilio
 */
export async function getMediaProxy(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { url } = getMediaSchema.parse(req.query);
    
    // Validate domain to prevent SSRF
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.endsWith('twilio.com')) {
      return res.status(400).json({ error: 'Invalid media URL' });
    }

    // Determine if we need auth headers for this URL
    // Twilio media URLs usually look like: https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages/{MessageSid}/Media/{MediaSid}
    // If it's a Twilio URL, we add the Basic Auth header
    const options = {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64'),
      },
    };

    const handleRedirect = (redirectUrl: string) => {
      https.get(redirectUrl, (proxyRes) => {
        if (proxyRes.statusCode !== 200) {
           // Handle another redirect or error
           if (proxyRes.statusCode === 301 || proxyRes.statusCode === 302 || proxyRes.statusCode === 307) {
             const nextUrl = proxyRes.headers.location;
             if (nextUrl) {
               handleRedirect(nextUrl);
               return;
             }
           }

          logger.error({ 
            event: 'media_proxy_error', 
            statusCode: proxyRes.statusCode, 
            url: redirectUrl 
          });
          proxyRes.resume();
          return res.status(proxyRes.statusCode || 500).json({ error: 'Failed to fetch media' });
        }

        if (proxyRes.headers['content-type']) {
          res.setHeader('Content-Type', proxyRes.headers['content-type']);
        }
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        proxyRes.pipe(res);
      }).on('error', (err) => {
        logger.error({ event: 'media_proxy_request_error', error: err });
        res.status(500).json({ error: 'Failed to request media' });
      });
    };

    https.get(url, options, (proxyRes) => {
      // Handle redirects (Twilio often returns 307 Temporary Redirect for media)
      if (proxyRes.statusCode === 301 || proxyRes.statusCode === 302 || proxyRes.statusCode === 307) {
        const redirectUrl = proxyRes.headers.location;
        if (redirectUrl) {
          handleRedirect(redirectUrl);
          return;
        }
      }

      if (proxyRes.statusCode !== 200) {
        logger.error({ 
          event: 'media_proxy_error', 
          statusCode: proxyRes.statusCode, 
          url 
        });
        proxyRes.resume();
        return res.status(proxyRes.statusCode || 500).json({ error: 'Failed to fetch media' });
      }

      if (proxyRes.headers['content-type']) {
        res.setHeader('Content-Type', proxyRes.headers['content-type']);
      }
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      proxyRes.pipe(res);
    }).on('error', (err) => {
      logger.error({ event: 'media_proxy_request_error', error: err });
      res.status(500).json({ error: 'Failed to request media' });
    });

  } catch (error) {
    logger.error({ event: 'media_proxy_error', error });
    return res.status(400).json({ error: 'Invalid request' });
  }
}

