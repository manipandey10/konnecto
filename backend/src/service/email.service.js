
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

// Verify the connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('Error connecting to email server:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});
// Function to send email
const sendEmail = async (to, subject, text, html) => {
  try {
    const info = await transporter.sendMail({
      from: `"KONNECTO" <${process.env.EMAIL_USER}>`, // sender address
      to, // list of receivers
      subject, // Subject line
      text, // plain text body
      html, // html body
    });

    console.log('Message sent: %s', info.messageId);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

async function sendregisterationemail(useremail,name){
  const username = escapeHtml(name || 'there');
  const frontendUrl = escapeHtml(getFrontendUrl());

  const subject = 'Welcome to KONNECTO — Let’s Connect!';

  // Plain text fallback
  const text = `
Hello ${name || 'there'},

Welcome to KONNECTO!

Your account has been successfully created.

Connect. Collaborate. Create.

MEETINGS • CHAT • VIDEO • WHITEBOARD

Thank you for choosing KONNECTO.

Devloped by MRP WORLD.
  `.trim();

  // HTML EMAIL TEMPLATE
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">

  <title>Welcome to KONNECTO</title>

  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f7f7fb;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    table {
      border-spacing: 0;
      border-collapse: collapse;
    }

    img {
      border: 0;
    }

    a {
      text-decoration: none;
    }

    @media only screen and (max-width: 620px) {
      .email-container {
        width: 100% !important;
      }

      .main-content {
        padding: 35px 24px !important;
      }

      .heading {
        font-size: 34px !important;
        line-height: 42px !important;
      }

      .footer-content {
        padding: 24px !important;
      }

      .cta-button {
        display: block !important;
        text-align: center !important;
      }
    }
  </style>
</head>

<body>

  <!-- PREHEADER -->
  <div style="
    display:none;
    font-size:1px;
    color:#f7f7fb;
    line-height:1px;
    max-height:0;
    max-width:0;
    opacity:0;
    overflow:hidden;
  ">
    Welcome to KONNECTO! Your space to connect and collaborate.
  </div>

  <table width="100%" role="presentation"
    bgcolor="#f7f7fb">

    <tr>
      <td align="center" style="padding:35px 12px;">

        <!-- MAIN EMAIL CONTAINER -->
        <table
          class="email-container"
          width="600"
          role="presentation"
          bgcolor="#ffffff"
          style="
            width:600px;
            max-width:600px;
            background:#ffffff;
            border-radius:12px;
            overflow:hidden;
          "
        >

          <!-- HEADER -->
          <tr>
            <td style="
              padding:30px 42px;
              border-bottom:1px solid #eeeeF5;
            ">

              <table width="100%" role="presentation">
                <tr>
                  <td align="left">

                    <span style="
                      font-size:25px;
                      font-weight:800;
                      letter-spacing:-1px;
                      color:#171638;
                    ">
                      <span style="color:#6938ef;">K.</span>
                      KONNECTO
                    </span>

                  </td>

                  <td align="right" style="
                    font-size:11px;
                    color:#77758d;
                    letter-spacing:1px;
                  ">
                    CONNECT · MEET · COLLABORATE
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- MAIN CONTENT -->
          <tr>
            <td
              class="main-content"
              style="padding:55px 48px 45px;"
            >

              <!-- GREETING -->
              <p style="
                margin:0 0 20px;
                font-size:16px;
                color:#66647b;
              ">
                Hello ${username},
              </p>

              <!-- HEADING -->
              <h1
                class="heading"
                style="
                  margin:0 0 22px;
                  font-size:43px;
                  line-height:52px;
                  font-weight:800;
                  letter-spacing:-1.8px;
                  color:#171638;
                "
              >
                Welcome to
                <span style="color:#6938ef;">
                  KONNECTO.
                </span>
              </h1>

              <!-- DESCRIPTION -->
              <p style="
                margin:0;
                font-size:16px;
                line-height:27px;
                color:#69677e;
              ">
                Your account is ready. A better way to
                connect, communicate and collaborate
                starts right here.
              </p>

              <!-- SMALL ACCENT -->
              <table role="presentation" style="margin-top:27px;">
                <tr>
                  <td width="48" height="4"
                    bgcolor="#6938ef"
                    style="
                      border-radius:5px;
                      font-size:0;
                      line-height:0;
                    ">
                    &nbsp;
                  </td>
                </tr>
              </table>

              <!-- CTA BUTTON -->
              <table role="presentation" style="margin-top:35px;">
                <tr>
                  <td
                    bgcolor="#6938ef"
                    style="border-radius:7px;"
                  >
                    <a
                      href="${frontendUrl}"
                      target="_blank"
                      class="cta-button"
                      style="
                        display:inline-block;
                        padding:16px 29px;
                        color:#ffffff;
                        font-size:15px;
                        font-weight:700;
                        letter-spacing:0.2px;
                        border-radius:7px;
                      "
                    >
                      Explore KONNECTO &nbsp; →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- SECONDARY TEXT -->
              <p style="
                margin:22px 0 0;
                font-size:13px;
                line-height:22px;
                color:#9694a8;
              ">
                We're glad you're here. Let's make every
                connection count.
              </p>

            </td>
          </tr>

          <!-- DIVIDER -->
          <tr>
            <td style="padding:0 48px;">
              <div style="
                height:1px;
                background:#eeeeF5;
                font-size:0;
                line-height:0;
              ">
                &nbsp;
              </div>
            </td>
          </tr>

          <!-- SIMPLE BRAND MESSAGE -->
          <tr>
            <td align="center" style="
              padding:35px 30px 40px;
            ">

              <p style="
                margin:0 0 9px;
                font-size:19px;
                font-weight:700;
                color:#171638;
              ">
                Great things happen when we connect.
              </p>

              <p style="
                margin:0;
                font-size:14px;
                line-height:23px;
                color:#89879b;
              ">
                Thank you for becoming part of
                the KONNECTO community.
              </p>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td
              class="footer-content"
              align="center"
              bgcolor="#f8f7fc"
              style="
                padding:28px 35px;
                border-top:1px solid #eeeeF5;
              "
            >

              <p style="
                margin:0 0 10px;
                font-size:19px;
                font-weight:800;
                letter-spacing:-0.5px;
                color:#171638;
              ">
                <span style="color:#6938ef;">K.</span>
                KONNECTO
              </p>

              <p style="
                margin:0 0 17px;
                font-size:12px;
                color:#88869a;
                letter-spacing:0.5px;
              ">
                Connect Beyond Boundaries.
              </p>

              <p style="
                margin:0;
                font-size:11px;
                line-height:19px;
                color:#a19fb0;
              ">
                You received this email because an account
                was successfully registered with KONNECTO.
                <br>
                © ${new Date().getFullYear()} KONNECTO.
                All rights reserved.
              </p>

            </td>
          </tr>

        </table>
        <!-- END MAIN EMAIL CONTAINER -->

      </td>
    </tr>

  </table>

</body>
</html>
  `;

  // SEND WELCOME EMAIL
  return await sendEmail(
    useremail,
    subject,
    text,
    html
  );
};





module.exports = {sendregisterationemail}

