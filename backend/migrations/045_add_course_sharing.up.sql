-- Course share links for external review access
CREATE TABLE IF NOT EXISTS course_share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    token VARCHAR(64) NOT NULL UNIQUE,
    allowed_emails TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_course_share_links_token ON course_share_links(token);
CREATE INDEX idx_course_share_links_course_id ON course_share_links(course_id);
CREATE INDEX idx_course_share_links_tenant_id ON course_share_links(tenant_id);

ALTER TABLE course_share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY course_share_links_tenant_isolation ON course_share_links
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Verification codes for share link email verification
CREATE TABLE IF NOT EXISTS share_verification_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_link_id UUID NOT NULL REFERENCES course_share_links(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_share_verification_codes_link_email ON share_verification_codes(share_link_id, email);

-- Review comments from external reviewers
CREATE TABLE IF NOT EXISTS share_review_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_link_id UUID NOT NULL REFERENCES course_share_links(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lesson_id VARCHAR(255) NOT NULL,
    reviewer_email VARCHAR(255) NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_share_review_comments_course_lesson ON share_review_comments(course_id, lesson_id);
CREATE INDEX idx_share_review_comments_link ON share_review_comments(share_link_id);
