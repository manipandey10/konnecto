const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const sentMessages = [];
let sendError = null;
const fakeTransporter = {
    verify(callback) {
        callback(null);
    },
    async sendMail(message) {
        if (sendError) throw sendError;
        sentMessages.push(message);
        return { messageId: "test-message-id" };
    },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === "nodemailer") {
        return { createTransport: () => fakeTransporter };
    }
    return originalLoad.call(this, request, parent, isMain);
};

const originalEmailUser = process.env.EMAIL_USER;
const originalFrontendUrl = process.env.FRONTEND_URL;
process.env.EMAIL_USER = "konnecto@example.test";
process.env.FRONTEND_URL = "https://konnecto.example.test";
const emailService = require("../src/service/email.service");
Module._load = originalLoad;

test("welcome and login notifications use distinct subjects and escape HTML", async (t) => {
    t.after(() => {
        if (originalEmailUser === undefined) delete process.env.EMAIL_USER;
        else process.env.EMAIL_USER = originalEmailUser;
        if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
        else process.env.FRONTEND_URL = originalFrontendUrl;
    });
    sentMessages.length = 0;

    await emailService.sendRegistrationEmail("test@example.com", "<Test User>");
    await emailService.sendLoginEmail("test@example.com", "<Test User>");

    assert.equal(sentMessages.length, 2);
    assert.match(sentMessages[0].subject, /Welcome/i);
    assert.match(sentMessages[0].html, /&lt;Test User&gt;/);
    assert.match(sentMessages[1].subject, /sign-in/i);
    assert.notEqual(sentMessages[0].subject, sentMessages[1].subject);
    assert.match(sentMessages[1].html, /&lt;Test User&gt;/);
});

test("email delivery errors propagate to the controller notification guard", async () => {
    sendError = Object.assign(new Error("delivery failed"), { code: "ESMTP" });
    await assert.rejects(
        emailService.sendLoginEmail("test@example.com", "KONNECTO Test"),
        /delivery failed/,
    );
    sendError = null;
});
