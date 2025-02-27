import crypto from "crypto";
import { cryptico, RSAKey } from "@daotl/cryptico";

// We are using Z85 instead of Base64 since it has a smaller encoded size
// This is a memory usage optimisation
import { encode as _z85encode, decode as _z85decode } from "z85-codec";
import { ConversationResponse, MessageSuperObj } from "./convo";
import User, { PublicUserAccount } from "./usrlib";
import { convertUserToPublicUserAccount } from "@/components/conversation";

type BaseMsgMeta = {

}

interface MessageMeta extends BaseMsgMeta {
    checksum: string;
}

// Secured message decryption key objetc
export type RecipientPayload = {
    messageId: string;
    recipientId: string;
    recipientKeyId: string;
    RSASecuredKey: string;
    AESKeyHash: string;
    signature: string;
    redistributionToken: string;
    redistTokenSig: string;
    redistSenderId?: string;
}

export type MessageObject = {
    ciphertext: string;
    senderId: string;
    channelId: string;
    sentAt: number;
    meta: MessageMeta;
    checksum: string;
    signature: string;
    messageId: string;
    prevChecksum: string;
}

export type DecryptedMessage = {
    id: string;
    plaintext: string;
    sentAt: number;
    meta: MessageMeta;
    channelId: string;
    senderId: string;
}

export type SecureKeyPair = {
    type: "primary" | "normal"
    keyId: string;
    publicKey: string;
    encryptedPayload: {
        payload: string;
        auth: string;
    };
    decryptionKey: string;
    decKeyMixHash: string;
    decKeyIv: string;
    mixToken: string;
    primaryKey?: SecureKeyPair;
}

function hash(payload: string, iterations?: number, type?: string): string {
    if (!iterations) return crypto.createHash(type ?? 'sha256').update(payload).digest('hex');

    let p = crypto.createHash(type ?? 'sha256').update(payload, "utf-8").digest('hex');

    for (let i = 0; i < iterations; i++) {
        p = crypto.createHash(type ?? 'sha256').update(p, "utf-8").digest('hex');
    }

    return p;
}

function sha256(payload: string, iterations?: number) {
    return hash(payload, iterations, "sha256");
}

function sha512(payload: string, iterations?: number) {
    return hash(payload, iterations, "sha512");
}

function generateMessageMeta(meta: BaseMsgMeta): MessageMeta {
    const metaKeys = Object.keys(meta).sort((a, b) => a.localeCompare(b));

    const finalMeta: MessageMeta = {
        ...meta,
        checksum: sha256(metaKeys.join("+")),
    }

    return finalMeta;
}

function trimTrailingNull(buffer: Buffer) {
    let index = buffer.length;

    // If this buffer doesn't have a trailing null byte, return it as-is
    if (buffer[buffer.length - 1] !== 0x00) return buffer;

    // Work backwards to find when the first non null byte occurs
    for (let i = buffer.length; i > 0; i--) {
        if (buffer[i] !== 0x00 && buffer[i + 1] == 0x00) {
            index = i;
            break;
        }
    }

    return buffer.subarray(0, index + 1);
}

const hashRounds = (d: string, rounds?: number) => {
    if (!rounds)
        rounds = 1;

    let hash = d;

    for (let i = 0; i < rounds; i++) {
        hash = sha256(hash);
    }

    return hash;
}

// This is the Message Authority handler class for the user account
export class MessageAuthority {
    privateKey: SecureKeyPair;
    rsa?: RSAKey;
    rsaPrimaryKey?: RSAKey;
    public derivations: {
        mixToken: string;
        primaryKey: SecureKeyPair;
    };

    constructor(RSAKeyGenerationFactors?: string[], isPrimary?: boolean) {
        let seed = sha512(crypto.randomBytes(32).toString("hex"));

        // If keygen factors were provided, use that as the seed for this key
        if (RSAKeyGenerationFactors && RSAKeyGenerationFactors.length > 0) seed = sha512(RSAKeyGenerationFactors.join("+"));

        this.privateKey = this._generateNewKeypair(seed, undefined, isPrimary);
        this.derivations = {
            mixToken: this.privateKey.mixToken,
            // It is safe to assume this is a primary key
            primaryKey: this.privateKey.primaryKey!,
        };

        console.log("[MessageAuthority] RSA keypair with ID:", this.privateKey.keyId);
    }

    private _generateNewKeypair(seed: string, keyMixData?: string, isPrimary?: boolean) {
        const iv = this._generateRandomIV();
        const keyCode = this._generateRandomIV().toString("hex");

        const rsaKey = cryptico.generateRSAKey(sha512(seed), isPrimary ? 1024 : 2048);

        if (isPrimary)
            this.rsaPrimaryKey = rsaKey;
        else
            this.rsa = rsaKey;

        const pub = cryptico.publicKeyString(rsaKey);

        const payload: SecureKeyPair = {
            type: (isPrimary ? "primary" : "normal"),
            keyId: cryptico.publicKeyID(pub),
            publicKey: pub,
            encryptedPayload: this._encryptWithAES(seed, iv, sha256(sha256(keyMixData ?? "", 12) + "-mchat-s" + keyCode) + sha256(iv.toString("hex"))),
            decryptionKey: keyCode,
            decKeyMixHash: keyMixData ? sha256(((keyMixData ?? "") + "-mchat")) : "",
            decKeyIv: iv.toString("hex"),
            mixToken: hashRounds(seed, 50),
            // Dont generate a primaryKey if this already is one
            primaryKey: (isPrimary ? undefined : this._generateNewKeypair(hashRounds(seed, 150), keyMixData, true)),
        }

        return payload;
    }

    private _generateRandomIV(bitsize = 16) {
        return crypto.randomBytes(bitsize);
    }

    private _encodeString(input: Buffer) {
        const diff = input.length % 4;
        const pad = Buffer.alloc(4 - diff);
    
        // Ensure the z85 encode input is of a size of a multiple of 4 (to prevent a null response)
        const paddedBuffer = new Uint8Array(Buffer.concat([new Uint8Array(input), new Uint8Array(pad)]));
    
        return _z85encode(paddedBuffer)!;
    }

    private _decodeString(input: string, returnBuf?: boolean) {
        const buf = Buffer.from(_z85decode(input)!);
    
        // Remove any trailing null bytes used to padd the data
        const data = trimTrailingNull(buf);

        return (returnBuf ? data : data.toString());
    }

    private _encryptWithAES(payload: string, iv: Buffer, key: string) {
        const secret_key = crypto.createHash('sha512').update(key).digest('hex').substring(0, 32);

        const cipher = crypto.createCipheriv("aes-256-gcm", secret_key, iv);

        const entropy = crypto.randomBytes(16);
        const payloadArray = Buffer.from(payload, "utf8");
        
        // Add additional entropy to the ciphertext
        const dataBuf = Buffer.concat([entropy, payloadArray]);

        const encrypted = Buffer.concat([cipher.update(dataBuf), cipher.final()]);
        const auth = cipher.getAuthTag().toString("hex");

        return {
            payload: this._encodeString(encrypted),
            auth: auth,
        };
    }

    private _decryptWithAES(ciphertext: string, iv: Buffer | string, key: string, authTag: string) {
        const secret_key = crypto.createHash('sha512').update(key).digest('hex').substring(0, 32);

        if (typeof iv == "string") iv = Buffer.from(iv, "hex");

        const buf = this._decodeString(ciphertext, true) as Buffer;
        const decipher = crypto.createDecipheriv("aes-256-gcm", secret_key, iv);

        decipher.setAuthTag(Buffer.from(authTag, "hex"));

        const decrypted = Buffer.concat([decipher.update(buf), decipher.final()]);

        // Remove the added entropy
        return decrypted.slice(16).toString('utf8');
    }

    sign(payload: string) {
        if (!this.rsa) return undefined;

        return this.rsa.signStringWithSHA256(payload);
    }

    encryptMessage(plaintext: string, recipientPublicKeys: {
        key: RSAKey;
        id: string;
    }[], factor: string, senderId: string, convoId: string) {
        if (!this.rsa) throw new Error("Message encryption failed: Security RSA key has not yet been loaded (or generated)!");
        if (!this.rsaPrimaryKey) throw new Error("Message encryption failed: Primary RSA key has not yet been loaded (or generated)!");

        // Decrypt this conversation's factor using our primary key
        const ourFactor = this.rsaPrimaryKey?.decrypt(factor);

        if (!ourFactor)
            throw new Error("Message encryption failed: Primary RSA key was unable to decrypt conversaton factor");
        
        // Create a random AES key and IV for this message
        const L1AESKey = crypto.randomBytes(32).toString("hex");
        const L1AESIv = this._generateRandomIV();

        // Encrypt the plaintext
        const stage1 = this._encryptWithAES(plaintext, L1AESIv, L1AESKey);

        // Encrypt using the conversation's encryption factor (so that it is required to decrypt)
        const pEncIv = this._generateRandomIV();
        const preEncrypt = this._encryptWithAES(stage1.payload, pEncIv, sha256(ourFactor).slice(0, 64));

        const sentAt = new Date().getTime();
        const meta: MessageMeta = generateMessageMeta({});
        const messageId = this._generateRandomIV(32).toString("hex");

        const checksum = sha256(plaintext + senderId + convoId + sentAt.toString() + meta.checksum + messageId);

        const messagePayload: MessageObject = {
            ciphertext: preEncrypt.payload,
            senderId,
            channelId: convoId,
            sentAt,
            meta,
            checksum,
            signature: this.rsa.signStringWithSHA256(checksum),
            messageId,
            // prevChecksum is reassgined on the server so we dont have to worry about it here
            prevChecksum: "",
        };

        const messageKey = [pEncIv.toString("hex"), preEncrypt.auth, L1AESIv.toString("hex"), L1AESKey, stage1.auth].join(".");
        const AESKeyHash = sha256(L1AESKey);

        // Sign this message with both keys to prove we sent it
        const securitySig = this.rsa.signString(checksum, "sha256");
        const primarySig = this.rsaPrimaryKey.signString(checksum, "sha256");

        let recipientKeyCopies: RecipientPayload[] = [];

        // Generate a recipient payload for each recipient
        for (const recipientKey of recipientPublicKeys) {
            // TODO: Implement recipientId
            const recipientId = recipientKey.id;

            const redistributionToken = sha256(this._generateRandomIV(32).toString("hex"));
            const redistTokenSig = this.rsa.signStringWithSHA256(sha256(messagePayload.checksum + redistributionToken + recipientId));

            const recipientPayload: RecipientPayload = {
                messageId,
                recipientId,
                recipientKeyId: cryptico.publicKeyID(cryptico.publicKeyString(recipientKey.key)),
                RSASecuredKey: recipientKey.key.encrypt(messageKey),
                AESKeyHash,
                signature: this.rsa.signStringWithSHA256(AESKeyHash + recipientId),
                redistributionToken,
                redistTokenSig,
            }

            recipientKeyCopies.push(recipientPayload);
        }

        return {
            message: messagePayload,
            recipientKeys: recipientKeyCopies,
            signatures: {
                security: securitySig,
                primary: primarySig,
            }
        };
    }

    // This function just makes it easier to decrypt loaded messages without worrying about all the parameters
    decryptSuperMessages(user: User, convo: ConversationResponse, keychain?: PublicUserAccount[]) {
        // We are not a part of this conversation, so dont try to decrypt the message
        if (convo.parties.filter(v => v.userId == user.id).length == 0)
            return undefined;

        const factor = convo.parties.filter(v => v.userId == user.id)[0].factor;

        let parsed: {
            msgId: string;
            error: boolean;
            errorReason: "no-error" | "no-payload" | "failed";
            data?: DecryptedMessage;
            checksum: string;
            prevChecksum: string;
        }[] = [];

        for (const msg of convo.messages) {
            if (!msg.recvPayloads[user.id]) {
                // We dont have a payload to help us decrypt the message, mark it failed
                parsed.push({
                    msgId: msg.code.messageId,
                    error: true,
                    errorReason: "no-payload",
                    checksum: "",
                    prevChecksum: "",
                });

                continue;
            }
            
            try {
                const decrypted = this.decryptMessage(msg.code, msg.recvPayloads[user.id]!, factor, user, keychain);

                // Success
                parsed.push({
                    msgId: msg.code.messageId,
                    error: false,
                    errorReason: "no-error",
                    data: decrypted,
                    checksum: msg.code.checksum,
                    prevChecksum: msg.code.prevChecksum,
                });
            } catch (ex) {
                console.error("Message decryption failed, error:", ex);

                // Decryption failed
                parsed.push({
                    msgId: msg.code.messageId,
                    error: true,
                    errorReason: "failed",
                    checksum: "",
                    prevChecksum: "",
                });

                continue;
            }
        }

        return parsed;
    }

    decryptMessage(securedMessage: MessageObject, recvKey: RecipientPayload, factor: string, user: User, keychain?: PublicUserAccount[]): DecryptedMessage {
        // Decrypt this conversation's factor using our primary key
        const ourFactor = this.rsaPrimaryKey?.decrypt(factor);

        if (!ourFactor)
            throw new Error("Message encryption failed: Primary RSA key was unable to decrypt conversaton factor");

        const recipientId = recvKey.recipientId;

        const circle = keychain || user.circle;

        console.log(circle)

        const messageKey = this.rsa?.decrypt(recvKey.RSASecuredKey);
        if (!messageKey) throw new Error("Unable to decrypt message: message key decryption resulted in an empty object");

        // Find sender's RSA public key in user circle
        // If we are the sender, override the sender with our own public key (since we are not in our own circle)
        const sender = (securedMessage.senderId == user.id ? [convertUserToPublicUserAccount(user)] : circle.filter(v => v.id == securedMessage.senderId));

        if (sender.length == 0)
            throw new Error("Unable to decrypt message: sender's public key was not found in the user's circle");

        const originalMessageSigner = cryptico.publicKeyFromString(sender[0].encryption.publicKey);

        let AESKeySigner = originalMessageSigner;

        // Handle a redistributed message
        if (recvKey.redistSenderId) {
            // Verify the redistributionToken
            const tokenChecksum = sha256(securedMessage.checksum + recvKey.redistributionToken + recvKey.redistSenderId);

            // tokenChecksum is generated and isgned when the original message is being sent
            // sha256(securedMessage.checksum + recvKey.redistributionToken + recvKey.redistSenderId) must equal what this original hash was (not provided since it is not required as long as signature is valid for it)
            const isRedistTokenValid = AESKeySigner?.verifyString(tokenChecksum, recvKey.redistTokenSig);

            if (!isRedistTokenValid) throw new Error("Unable to decrypt message: redistributed message did not have a valid redistribution token (rejected due to invalid signature)");

            // Find redistributor's RSA public key in user circle
            const redistributor = circle.filter(v => v.id == recvKey.redistSenderId);

            if (redistributor.length == 0)
                throw new Error("Unable to decrypt message: redistributor's public key was not found in the user's circle");

            AESKeySigner = cryptico.publicKeyFromString(redistributor[0].encryption.publicKey);
        }

        if (!messageKey.includes(".")) throw new Error("Unable to decrypt message: message key was incorrectly formatted");
        if (messageKey.split(".").length !== 5) throw new Error("Unable to decrypt message: message key had an invalid number of sections");

        // We can leave preEncryptIv and L1AESIv as hex since _decryptWithAES will automatically convert into a buffer
        const [preEncryptIv, preEncryptAuth, L1AESIv, L1AESKey, L1AESAuth] = messageKey.split(".");

        if (sha256(L1AESKey) !== recvKey.AESKeyHash)
            throw new Error("Unable to decrypt message: recipient payload AES key hash did not match the decrypted key");

        const isAESKeyValid = AESKeySigner?.verifyString(sha256(L1AESKey) + recipientId, recvKey.signature);
        if (!isAESKeyValid) throw new Error("Unable to decrypt message: recipient payload message key had an unexpected signature");

        const cipher = this._decryptWithAES(securedMessage.ciphertext, preEncryptIv, sha256(ourFactor).slice(0, 64), preEncryptAuth);

        // Decrypt the message payload
        const decryptedMessage = this._decryptWithAES(cipher, L1AESIv, L1AESKey, L1AESAuth);

        // Verify message signature
        const messageChecksum = sha256(decryptedMessage + securedMessage.senderId + securedMessage.channelId + securedMessage.sentAt.toString() + securedMessage.meta.checksum + securedMessage.messageId);

        if (messageChecksum !== securedMessage.checksum)
            throw new Error("Unable to decrypt message: calculated message checksum did not match the secure object checksum");

        const isMessageValid = originalMessageSigner?.verifyString(messageChecksum, securedMessage.signature);

        if (!isMessageValid) throw new Error("Unable to decrypt message: message signature was invalid");

        return {
            id: securedMessage.messageId,
            plaintext: decryptedMessage,
            sentAt: securedMessage.sentAt,
            meta: securedMessage.meta,
            channelId: securedMessage.channelId,
            senderId: securedMessage.senderId,
        };
    }
}
