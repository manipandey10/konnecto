const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const emailCalls = [];
const emailService = {
    sendRegistrationEmail: async (...args) => emailCalls.push(["registration", ...args]),
    sendLoginEmail: async (...args) => emailCalls.push(["login", ...args]),
    sendOtpEmail: async (...args) => emailCalls.push(["otp", ...args]),
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === "../service/email.service") return emailService;
    return originalLoad.call(this, request, parent, isMain);
};
const authController = require("../src/controller/auth.controller");
const otpService = require("../src/service/otp.service");
Module._load = originalLoad;

const app = require("../src/app");
const usermodel = require("../src/model/user.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        cookieOptions: null,
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        cookie(name, value, options) {
            this.cookieOptions = { name, value, options };
            return this;
        },
    };
}

test("registration, login, and validation require OTP verification before issuing auth", async (t) => {
    const originals = {
        findOne: usermodel.findOne,
        create: usermodel.create,
        hash: bcrypt.hash,
        compare: bcrypt.compare,
        sign: jwt.sign,
        sendRegistration: emailService.sendRegistrationEmail,
        sendLogin: emailService.sendLoginEmail,
        sendOtp: emailService.sendOtpEmail,
        sendOtpForUser: otpService.sendOtpForUser,
        consoleError: console.error,
    };
    t.after(() => {
        Object.assign(usermodel, { findOne: originals.findOne, create: originals.create });
        Object.assign(bcrypt, { hash: originals.hash, compare: originals.compare });
        jwt.sign = originals.sign;
        emailService.sendRegistrationEmail = originals.sendRegistration;
        emailService.sendLoginEmail = originals.sendLogin;
        emailService.sendOtpEmail = originals.sendOtp;
        otpService.sendOtpForUser = originals.sendOtpForUser;
        console.error = originals.consoleError;
    });

    console.error = () => {};
    emailCalls.length = 0;
    const user = {
        _id: "user-1",
        name: "KONNECTO Test",
        email: "test@example.com",
        password: "hashed-password",
        isVerified: false,
    };
    const order = [];

    usermodel.findOne = async () => null;
    usermodel.create = async (data) => {
        order.push("created");
        assert.equal(data.email, "test@example.com");
        assert.equal(data.password, "hashed-password");
        return user;
    };
    bcrypt.hash = async () => "hashed-password";
    jwt.sign = () => "signed-test-token";
    otpService.sendOtpForUser = async () => {
        order.push("otp");
        return {};
    };
    emailService.sendRegistrationEmail = async (...args) => {
        order.push("welcome-email");
        emailCalls.push(["registration", ...args]);
        throw new Error("mail service unavailable");
    };
    emailService.sendOtpEmail = async (...args) => {
        order.push("otp-email");
        emailCalls.push(["otp", ...args]);
        throw new Error("mail service unavailable");
    };

    const registrationResponse = createResponse();
    await authController.registerUser({
        body: { name: "KONNECTO Test", email: "Test@Example.com", password: "password" },
    }, registrationResponse);

    assert.equal(registrationResponse.statusCode, 201);
    assert.equal(registrationResponse.body.requiresOtp, true);
    assert.equal(registrationResponse.body.token, undefined);
    assert.deepEqual(order, ["created", "otp", "welcome-email"]);

    usermodel.findOne = async () => user;
    const duplicateResponse = createResponse();
    await authController.registerUser({
        body: { name: user.name, email: user.email, password: "password" },
    }, duplicateResponse);
    assert.equal(duplicateResponse.statusCode, 409);

    usermodel.findOne = async () => user;
    bcrypt.compare = async () => true;
    emailService.sendLoginEmail = async (...args) => {
        emailCalls.push(["login", ...args]);
        throw new Error("mail service unavailable");
    };
    const loginResponse = createResponse();
    await authController.loginUser({
        body: { email: "TEST@example.com", password: "password" },
    }, loginResponse);

    assert.equal(loginResponse.statusCode, 200);
    assert.equal(loginResponse.body.requiresOtp, true);
    assert.equal(loginResponse.body.token, undefined);
    assert.equal(emailCalls.filter(([type]) => type === "login").length, 1);

    const missingCredentialsResponse = createResponse();
    await authController.loginUser({ body: {} }, missingCredentialsResponse);
    assert.equal(missingCredentialsResponse.statusCode, 400);

    bcrypt.compare = async () => false;
    const invalidCredentialsResponse = createResponse();
    await authController.loginUser({
        body: { email: "test@example.com", password: "wrong-password" },
    }, invalidCredentialsResponse);
    assert.equal(invalidCredentialsResponse.statusCode, 401);
    assert.equal(emailCalls.filter(([type]) => type === "login").length, 1);
});

test("Express mounts the registration and login routes and returns validation JSON", async (t) => {
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });
    t.after(() => new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    }));

    const { port } = server.address();
    const registration = await fetch(`http://127.0.0.1:${port}/api/user/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
    });
    assert.equal(registration.status, 400);
    assert.match((await registration.json()).message, /required/i);

    const login = await fetch(`http://127.0.0.1:${port}/api/user/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
    });
    assert.equal(login.status, 400);
    assert.match((await login.json()).message, /password.*required/i);
});
