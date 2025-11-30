package smtp

import (
	"bytes"
	"context"
	"fmt"
	"html/template"
	"net/smtp"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

// Client implements service.EmailProvider using SMTP.
type Client struct {
	host     string
	port     string
	from     string
	username string
	password string
}

// NewClient creates a new SMTP client.
func NewClient(host, port, from, username, password string) service.EmailProvider {
	return &Client{
		host:     host,
		port:     port,
		from:     from,
		username: username,
		password: password,
	}
}

// SendInvitation sends an invitation email.
func (c *Client) SendInvitation(ctx context.Context, req service.SendInvitationRequest) error {
	subject := fmt.Sprintf("You've been invited to join %s on Mirai", req.CompanyName)

	body, err := c.renderInvitationEmail(req)
	if err != nil {
		return fmt.Errorf("failed to render email template: %w", err)
	}

	return c.sendEmail(req.To, subject, body)
}

// sendEmail sends an email via SMTP.
func (c *Client) sendEmail(to, subject, body string) error {
	addr := fmt.Sprintf("%s:%s", c.host, c.port)

	// Build email headers and body
	msg := fmt.Sprintf("From: %s\r\n"+
		"To: %s\r\n"+
		"Subject: %s\r\n"+
		"MIME-Version: 1.0\r\n"+
		"Content-Type: text/html; charset=\"UTF-8\"\r\n"+
		"\r\n"+
		"%s", c.from, to, subject, body)

	// Use auth only if username is provided
	var auth smtp.Auth
	if c.username != "" {
		auth = smtp.PlainAuth("", c.username, c.password, c.host)
	}

	err := smtp.SendMail(addr, auth, c.from, []string{to}, []byte(msg))
	if err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	return nil
}

// renderInvitationEmail renders the invitation email HTML template.
func (c *Client) renderInvitationEmail(req service.SendInvitationRequest) (string, error) {
	const emailTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Team Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px 40px; text-align: center;">
                            <h1 style="margin: 0; color: #7c3aed; font-size: 28px; font-weight: 700;">Mirai</h1>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">You're invited to join {{.CompanyName}}</h2>
                            <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                                {{.InviterName}} has invited you to join their team on Mirai. Click the button below to accept the invitation and get started.
                            </p>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td style="padding: 20px 0;">
                                        <a href="{{.InviteURL}}" style="display: inline-block; padding: 14px 32px; background-color: #7c3aed; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">Accept Invitation</a>
                                    </td>
                                </tr>
                            </table>
                            <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px;">
                                This invitation expires on {{.ExpiresAt}}.
                            </p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px 40px 40px; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                                If you didn't expect this invitation, you can safely ignore this email.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`

	tmpl, err := template.New("invitation").Parse(emailTemplate)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, req); err != nil {
		return "", err
	}

	return buf.String(), nil
}
