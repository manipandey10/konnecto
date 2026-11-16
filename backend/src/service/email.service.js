
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: process.env.EMAIL_USER,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    refreshToken: process.env.REFRESH_TOKEN,
  },
});

transporter.verify((error) => {
  if (error) {
    console.error('Error connecting to email server:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function getFrontendUrl() {
  return process.env.FRONTEND_URL || '';
}

const sendEmail = async (to, subject, text, html) => {
  return transporter.sendMail({
    from: `"KONNECTO" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  });
};

async function sendOtpEmail(useremail, otp, purpose = "login", expiryMinutes = 5) {
  const isRegistration = purpose === "registration";
  const actionText = isRegistration ? "Verify your account" : "Verify your sign-in";
  const bodyText = isRegistration
    ? "Your KONNECTO account needs to be verified before you can continue."
    : "Use the OTP below to complete your sign-in securely.";

  const subject = isRegistration
    ? "KONNECTO account verification"
    : "KONNECTO sign-in verification";

  const text = `
Hello,

${bodyText}

Your OTP is: ${otp}

This code expires in ${expiryMinutes} minutes.

If you did not request this, please ignore this email.
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KONNECTO Login Alert</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:35px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">

          <tr>
            <td align="center" style="background:#6938ef;padding:28px;">
              <h1 style="color:#fff;margin:0;font-size:28px;letter-spacing:2px;">
                KONNECTO
              </h1>
              <p style="color:#e9ddff;margin:8px 0 0;font-size:13px;">
                SECURITY NOTIFICATION
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:35px 30px;color:#252238;">
              <h2 style="font-size:24px;margin:0 0 15px;">
                Hello, ${username}!
              </h2>

              <div style="background:#ecfdf3;border-left:4px solid #16a34a;
                padding:16px;border-radius:8px;margin:20px 0;">
                <strong style="color:#15803d;">Successful Sign-in</strong>
                <p style="color:#555;margin:8px 0 0;font-size:14px;line-height:1.6;">
                  Your KONNECTO account was successfully accessed.
                </p>
              </div>

              <p style="font-size:14px;color:#666;line-height:1.7;">
                This is a security notification to keep you informed about
                activity on your account.
              </p>

              <p style="font-size:14px;color:#666;line-height:1.7;">
                If this was you, no action is required.
                If you don't recognize this activity, please secure your account.
              </p>

              <div style="text-align:center;margin:30px 0;">
                <a href="${frontendUrl}"
                  style="background:#6938ef;color:#fff;text-decoration:none;
                  padding:14px 28px;border-radius:8px;font-weight:bold;display:inline-block;">
                  Visit KONNECTO
                </a>
              </div>

              <p style="font-size:13px;color:#999;line-height:1.6;">
                Never share your password or verification OTP with anyone.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="background:#f8f7fb;padding:22px;">
              <p style="margin:0;color:#777;font-size:13px;">
                Stay connected. Stay secure.
              </p>
              <p style="margin:8px 0 0;color:#999;font-size:12px;">
                Developed by MRP WORLD.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;


  return sendEmail(useremail, subject, text, html);
}

async function sendRegistrationEmail(useremail, name) {
  const username = escapeHtml(name || 'there');
  const frontendUrl = escapeHtml(getFrontendUrl());

  const subject = 'Welcome to KONNECTO — Let’s Connect!';

  const text = `
Hello ${name || 'there'},

Welcome to KONNECTO!

Your account has been successfully created.

Connect. Collaborate. Create.

MEETINGS • CHAT • VIDEO • WHITEBOARD

Thank you for choosing KONNECTO.

Devloped by MRP WORLD.
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to KONNECTO</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:35px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">

          <tr>
            <td align="center" style="background:#6938ef;padding:30px;">
              <h1 style="color:#ffffff;margin:0;font-size:30px;letter-spacing:2px;">
                KONNECTO
              </h1>
              <p style="color:#e9ddff;margin:10px 0 0;font-size:13px;">
                CONNECT · COLLABORATE · CREATE
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:35px 30px;color:#252238;">
              <h2 style="font-size:25px;margin:0 0 15px;">
                Welcome, ${username}! 🎉
              </h2>

              <p style="font-size:15px;line-height:1.7;color:#666;">
                Your KONNECTO account has been created successfully.
                We're excited to have you as part of our community.
              </p>

              <div style="background:#f6f2ff;border-radius:12px;padding:20px;margin:25px 0;">
                <h3 style="color:#6938ef;margin:0 0 12px;">What you can do with KONNECTO</h3>
                <p style="color:#555;line-height:1.8;margin:0;">
                  🎥 Video Meetings<br>
                  💬 Real-time Chat<br>
                  📝 Collaborative Whiteboard<br>
                  🤝 Connect and Collaborate
                </p>
              </div>

              <p style="font-size:14px;color:#666;line-height:1.7;">
                Start connecting with people and make your collaboration
                experience better with KONNECTO.
              </p>

              <div style="text-align:center;margin:30px 0;">
                <a href="${frontendUrl}"
                  style="background:#6938ef;color:#ffffff;text-decoration:none;
                  padding:14px 30px;border-radius:8px;font-weight:bold;display:inline-block;">
                  Explore KONNECTO
                </a>
              </div>

              <p style="font-size:13px;color:#999;line-height:1.6;">
                If you did not create this account, please contact our support team.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="background:#f8f7fb;padding:22px;">
              <p style="margin:0;color:#777;font-size:13px;">
                Thank you for joining KONNECTO.
              </p>
              <p style="margin:8px 0 0;color:#999;font-size:12px;">
                Developed by MRP WORLD.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  return sendEmail(useremail, subject, text, html);
}

async function sendLoginEmail(useremail, name) {
  const username = escapeHtml(name || 'there');
  const subject = 'New sign-in to your KONNECTO account';
  const text = `Hello ${name || 'there'},\n\nYour KONNECTO account was just used to sign in.\n\nIf this was you, no action is needed.`;
  const frontendUrl = getFrontendUrl();
  const action = frontendUrl
    ? `<p style="margin:28px 0 0"><a href="${escapeHtml(frontendUrl)}" style="display:inline-block;padding:13px 22px;border-radius:7px;background:#6938ef;color:#fff;font-weight:700;text-decoration:none">Open KONNECTO</a></p>`
    : '';
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KONNECTO Login Alert</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:35px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">

          <tr>
            <td align="center" style="background:#6938ef;padding:28px;">
              <h1 style="color:#fff;margin:0;font-size:28px;letter-spacing:2px;">
                KONNECTO
              </h1>
              <p style="color:#e9ddff;margin:8px 0 0;font-size:13px;">
                SECURITY NOTIFICATION
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:35px 30px;color:#252238;">
              <h2 style="font-size:24px;margin:0 0 15px;">
                Hello, ${username}!
              </h2>

              <div style="background:#ecfdf3;border-left:4px solid #16a34a;
                padding:16px;border-radius:8px;margin:20px 0;">
                <strong style="color:#15803d;">Successful Sign-in</strong>
                <p style="color:#555;margin:8px 0 0;font-size:14px;line-height:1.6;">
                  Your KONNECTO account was successfully accessed.
                </p>
              </div>

              <p style="font-size:14px;color:#666;line-height:1.7;">
                This is a security notification to keep you informed about
                activity on your account.
              </p>

              <p style="font-size:14px;color:#666;line-height:1.7;">
                If this was you, no action is required.
                If you don't recognize this activity, please secure your account.
              </p>

              <div style="text-align:center;margin:30px 0;">
                <a href="${frontendUrl}"
                  style="background:#6938ef;color:#fff;text-decoration:none;
                  padding:14px 28px;border-radius:8px;font-weight:bold;display:inline-block;">
                  Visit KONNECTO
                </a>
              </div>

              <p style="font-size:13px;color:#999;line-height:1.6;">
                Never share your password or verification OTP with anyone.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="background:#f8f7fb;padding:22px;">
              <p style="margin:0;color:#777;font-size:13px;">
                Stay connected. Stay secure.
              </p>
              <p style="margin:8px 0 0;color:#999;font-size:12px;">
                Developed by MRP WORLD.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  return sendEmail(useremail, subject, text, html);
}

module.exports = { sendRegistrationEmail, sendLoginEmail, sendOtpEmail };

