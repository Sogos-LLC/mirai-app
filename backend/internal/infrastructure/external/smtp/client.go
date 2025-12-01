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

// SendWelcome sends a welcome email after account provisioning.
func (c *Client) SendWelcome(ctx context.Context, req service.SendWelcomeRequest) error {
	subject := "Welcome to Mirai! Your account is ready"

	body, err := c.renderWelcomeEmail(req)
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
                                    <td style="padding: 20px 0; text-align: center;">
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

// SendTaskAssignment sends a task assignment notification email.
func (c *Client) SendTaskAssignment(ctx context.Context, req service.SendTaskAssignmentRequest) error {
	subject := fmt.Sprintf("New Task Assigned: %s", req.TaskTitle)

	body, err := c.renderTaskAssignmentEmail(req)
	if err != nil {
		return fmt.Errorf("failed to render email template: %w", err)
	}

	return c.sendEmail(req.To, subject, body)
}

// SendIngestionComplete sends an ingestion completion notification email.
func (c *Client) SendIngestionComplete(ctx context.Context, req service.SendIngestionCompleteRequest) error {
	subject := fmt.Sprintf("Content Processed: %s", req.SMEName)

	body, err := c.renderIngestionCompleteEmail(req)
	if err != nil {
		return fmt.Errorf("failed to render email template: %w", err)
	}

	return c.sendEmail(req.To, subject, body)
}

// SendIngestionFailed sends an ingestion failure notification email.
func (c *Client) SendIngestionFailed(ctx context.Context, req service.SendIngestionFailedRequest) error {
	subject := fmt.Sprintf("Content Processing Failed: %s", req.TaskTitle)

	body, err := c.renderIngestionFailedEmail(req)
	if err != nil {
		return fmt.Errorf("failed to render email template: %w", err)
	}

	return c.sendEmail(req.To, subject, body)
}

// SendGenerationComplete sends a generation completion notification email.
func (c *Client) SendGenerationComplete(ctx context.Context, req service.SendGenerationCompleteRequest) error {
	subject := fmt.Sprintf("AI Generation Complete: %s", req.CourseTitle)

	body, err := c.renderGenerationCompleteEmail(req)
	if err != nil {
		return fmt.Errorf("failed to render email template: %w", err)
	}

	return c.sendEmail(req.To, subject, body)
}

// SendGenerationFailed sends a generation failure notification email.
func (c *Client) SendGenerationFailed(ctx context.Context, req service.SendGenerationFailedRequest) error {
	subject := fmt.Sprintf("AI Generation Failed: %s", req.CourseTitle)

	body, err := c.renderGenerationFailedEmail(req)
	if err != nil {
		return fmt.Errorf("failed to render email template: %w", err)
	}

	return c.sendEmail(req.To, subject, body)
}

// renderWelcomeEmail renders the welcome email HTML template.
func (c *Client) renderWelcomeEmail(req service.SendWelcomeRequest) (string, error) {
	const emailTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Mirai</title>
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
                            <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">Welcome to Mirai, {{.FirstName}}!</h2>
                            <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                                Your account for <strong>{{.CompanyName}}</strong> has been successfully created. You can now log in and start building amazing courses with AI assistance.
                            </p>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td style="padding: 20px 0; text-align: center;">
                                        <a href="{{.LoginURL}}" style="display: inline-block; padding: 14px 32px; background-color: #7c3aed; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">Log In to Mirai</a>
                                    </td>
                                </tr>
                            </table>
                            <h3 style="margin: 30px 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">What's next?</h3>
                            <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #4b5563; font-size: 15px; line-height: 1.8;">
                                <li>Create your first course with AI assistance</li>
                                <li>Invite team members to collaborate</li>
                                <li>Explore our course templates</li>
                            </ul>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 40px 40px 40px; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                                If you have any questions, reply to this email or visit our help center.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`

	tmpl, err := template.New("welcome").Parse(emailTemplate)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, req); err != nil {
		return "", err
	}

	return buf.String(), nil
}

// renderTaskAssignmentEmail renders the task assignment email template.
func (c *Client) renderTaskAssignmentEmail(req service.SendTaskAssignmentRequest) (string, error) {
	const emailTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Task Assignment</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <tr>
                        <td style="padding: 40px 40px 20px 40px; text-align: center;">
                            <h1 style="margin: 0; color: #7c3aed; font-size: 28px; font-weight: 700;">Mirai</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">New Task Assigned</h2>
                            <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                                Hi {{.AssigneeName}},<br><br>
                                {{.AssignerName}} has assigned you a new task for <strong>{{.SMEName}}</strong>:
                            </p>
                            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="margin: 0 0 10px 0; color: #1f2937; font-size: 18px;">{{.TaskTitle}}</h3>
                                {{if .DueDate}}<p style="margin: 0; color: #6b7280; font-size: 14px;">Due: {{.DueDate}}</p>{{end}}
                            </div>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td style="padding: 20px 0; text-align: center;">
                                        <a href="{{.TaskURL}}" style="display: inline-block; padding: 14px 32px; background-color: #7c3aed; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">View Task</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px 40px 40px 40px; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                                You received this email because a task was assigned to you on Mirai.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`

	tmpl, err := template.New("task_assignment").Parse(emailTemplate)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, req); err != nil {
		return "", err
	}

	return buf.String(), nil
}

// renderIngestionCompleteEmail renders the ingestion complete email template.
func (c *Client) renderIngestionCompleteEmail(req service.SendIngestionCompleteRequest) (string, error) {
	const emailTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Content Processed</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <tr>
                        <td style="padding: 40px 40px 20px 40px; text-align: center;">
                            <h1 style="margin: 0; color: #7c3aed; font-size: 28px; font-weight: 700;">Mirai</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600; text-align: center;">Content Processed Successfully</h2>
                            <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                                Hi {{.UserName}},<br><br>
                                The content for <strong>{{.TaskTitle}}</strong> has been processed and added to <strong>{{.SMEName}}</strong>. The knowledge is now available for AI course generation.
                            </p>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td style="padding: 20px 0; text-align: center;">
                                        <a href="{{.SMEURL}}" style="display: inline-block; padding: 14px 32px; background-color: #7c3aed; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">View SME Knowledge</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px 40px 40px 40px; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                                This is an automated notification from Mirai.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`

	tmpl, err := template.New("ingestion_complete").Parse(emailTemplate)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, req); err != nil {
		return "", err
	}

	return buf.String(), nil
}

// renderIngestionFailedEmail renders the ingestion failed email template.
func (c *Client) renderIngestionFailedEmail(req service.SendIngestionFailedRequest) (string, error) {
	const emailTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Content Processing Failed</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <tr>
                        <td style="padding: 40px 40px 20px 40px; text-align: center;">
                            <h1 style="margin: 0; color: #7c3aed; font-size: 28px; font-weight: 700;">Mirai</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600; text-align: center;">Content Processing Failed</h2>
                            <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                                Hi {{.UserName}},<br><br>
                                Unfortunately, we were unable to process the content for <strong>{{.TaskTitle}}</strong> in <strong>{{.SMEName}}</strong>.
                            </p>
                            <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 20px 0;">
                                <p style="margin: 0; color: #991b1b; font-size: 14px;">{{.ErrorMessage}}</p>
                            </div>
                            <p style="margin: 20px 0; color: #4b5563; font-size: 14px;">
                                Please try uploading the content again or contact support if the problem persists.
                            </p>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td style="padding: 20px 0; text-align: center;">
                                        <a href="{{.TaskURL}}" style="display: inline-block; padding: 14px 32px; background-color: #7c3aed; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">View Task</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px 40px 40px 40px; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                                This is an automated notification from Mirai.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`

	tmpl, err := template.New("ingestion_failed").Parse(emailTemplate)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, req); err != nil {
		return "", err
	}

	return buf.String(), nil
}

// renderGenerationCompleteEmail renders the generation complete email template.
func (c *Client) renderGenerationCompleteEmail(req service.SendGenerationCompleteRequest) (string, error) {
	const emailTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Generation Complete</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <tr>
                        <td style="padding: 40px 40px 20px 40px; text-align: center;">
                            <h1 style="margin: 0; color: #7c3aed; font-size: 28px; font-weight: 700;">Mirai</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600; text-align: center;">AI Generation Complete</h2>
                            <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                                Hi {{.UserName}},<br><br>
                                Great news! The AI has finished generating the {{.ContentType}} for <strong>{{.CourseTitle}}</strong>. Your content is ready for review.
                            </p>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td style="padding: 20px 0; text-align: center;">
                                        <a href="{{.CourseURL}}" style="display: inline-block; padding: 14px 32px; background-color: #7c3aed; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">Review Content</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px 40px 40px 40px; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                                This is an automated notification from Mirai.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`

	tmpl, err := template.New("generation_complete").Parse(emailTemplate)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, req); err != nil {
		return "", err
	}

	return buf.String(), nil
}

// renderGenerationFailedEmail renders the generation failed email template.
func (c *Client) renderGenerationFailedEmail(req service.SendGenerationFailedRequest) (string, error) {
	const emailTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Generation Failed</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <tr>
                        <td style="padding: 40px 40px 20px 40px; text-align: center;">
                            <h1 style="margin: 0; color: #7c3aed; font-size: 28px; font-weight: 700;">Mirai</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px 40px;">
                            <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600; text-align: center;">AI Generation Failed</h2>
                            <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                                Hi {{.UserName}},<br><br>
                                Unfortunately, we encountered an issue while generating the {{.ContentType}} for <strong>{{.CourseTitle}}</strong>.
                            </p>
                            <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 20px 0;">
                                <p style="margin: 0; color: #991b1b; font-size: 14px;">{{.ErrorMessage}}</p>
                            </div>
                            <p style="margin: 20px 0; color: #4b5563; font-size: 14px;">
                                Please try again or contact support if the problem persists.
                            </p>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td style="padding: 20px 0; text-align: center;">
                                        <a href="{{.CourseURL}}" style="display: inline-block; padding: 14px 32px; background-color: #7c3aed; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">View Course</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px 40px 40px 40px; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                                This is an automated notification from Mirai.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`

	tmpl, err := template.New("generation_failed").Parse(emailTemplate)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, req); err != nil {
		return "", err
	}

	return buf.String(), nil
}
