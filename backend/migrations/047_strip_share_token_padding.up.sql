-- Strip base64 padding (=) from existing share link tokens.
-- Tokens were generated with base64.URLEncoding which includes padding chars.
-- Padding chars in URL paths get stripped by browsers/proxies, breaking token lookup.
UPDATE course_share_links SET token = rtrim(token, '=') WHERE token LIKE '%=';
