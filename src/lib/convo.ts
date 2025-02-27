import { EventEmitter } from "events";

import { Uplink } from "./uplink";
import { MessageAuthority, MessageObject, RecipientPayload } from "./encryption";
import { TokenStorage } from "./tokens";
import User, { PublicUserAccount } from "./usrlib";
import { cryptico, sha256 } from "@daotl/cryptico";

export type ConversationResponse = {
    id: string;
    parties: Conversation["parties"];
    messages: MessageSuperObj[];
    type: Conversation["type"];
}

export type MessageSuperObj = {
    code: MessageObject;
    // recvPayloads indexed with userId and RecipientPayload
    recvPayloads: {[key: string]: RecipientPayload | null}
}

export type Conversation = {
    id: string;
    type: "case" | "team" | "private";
    parties: {
        userId: string;
        factor: string;
    }[];
    settings: {
        ephermeral?: boolean;
    },
    metadata: {[key: string]: any};
}

export type GetConversationPayload = {
    convoId: string;
    messageCount: number;
}

export type CreateConversationPayload = {
    type: Conversation["type"];
    recipientsIds: string[];
    settings: Conversation["settings"];
    metadata: Conversation["metadata"];
}

export class ConversationHandler extends EventEmitter {
    private uplink: Uplink;
    private tokenStore: TokenStorage;
    private activeTunnelKey: string;
    private id: string;
    private msgAuth: MessageAuthority;
    private user: User;
    private groupKeychain?: PublicUserAccount[];
    
    constructor(id: string, uplink: Uplink, tokenStore: TokenStorage, msgAuth: MessageAuthority, user: User, keychain?: PublicUserAccount[]) {
        super();

        this.id = id;
        this.uplink = uplink;
        this.tokenStore = tokenStore;
        this.activeTunnelKey = "";
        this.msgAuth = msgAuth;
        this.user = user;
        this.groupKeychain = keychain;
    }

    setGroupKeychain(keychain: PublicUserAccount[]) {
        this.groupKeychain = keychain;

        console.log("Successfully loaded group keychain, length:", keychain.length);
    }

    async doesConversationExist(convoId: string) {

    }

    async createConversation(payload: CreateConversationPayload) {
        const tun = await this.uplink.startSecureTunnel();

        const res = await tun.pushSecureFrame({
            type: "s-createconvo",
            payload: JSON.stringify(payload)
        });

        await tun.close();

        // Unexpected error
        if (res.type == "error")
            throw new Error("Failed to create conversation, response: " + JSON.stringify(res));

        const convoId = res.payload as string;

        this.id = convoId;

        return await this.loadConversation();
    }

    async loadConversation(messageCount?: number) {
        const tun = await this.uplink.startSecureTunnel();

        const payload: GetConversationPayload = {
            convoId: this.id,
            // Get 5 messages by default
            messageCount: messageCount ?? 5,
        }

        const res = await tun.pushSecureFrame({
            type: "s-getconvo",
            payload: JSON.stringify(payload),
        });

        await tun.close();

        // Error code 42 means there was no conversation matching that id
        if (res.type == "error" && res.errorCode == 42)
            return undefined;

        if (res.type == "error")
            throw new Error("Failed to get conversation with id: " + this.id + " response: " + JSON.stringify(res));

        return JSON.parse(res.payload as string) as ConversationResponse;
    }

    async sendMessage(convo: ConversationResponse, textContent: string) {
        // Ensure we have loaded the keychain the group if on a group conversation (such as a case or team)
        if (convo.type !== "private" && !this.groupKeychain)
            throw new Error("Keychain is not initialised for conversation");
        
        // Check if we are actually in this conversation
        const validConvo = (convo.parties.filter(v => v.userId == this.user.id).length > 0);

        const recipientsPUAs = this.groupKeychain || this.user.circle;

        if (!validConvo)
            throw new Error("Cannot send a message into a conversation where we are not a part of it");

        let filteredCircle: PublicUserAccount[] = [];

        // Loop once, incase circle was refreshed
        for (let i = 0; i < 1; i++) {
            // Filter user circle to only include users relavant to this conversation (and use to check if we need to refresh circle cache)
            const convoUserIds = convo.parties.filter(v => {
                // Remove ourself from the parties list (since we arent in out own circle)
                return v.userId !== this.user.id;
            }).map(v => {
                return v.userId;
            });

            filteredCircle = recipientsPUAs.filter((v) => {
                return convoUserIds.includes(v.id) && v.encryption.publicKey !== "";
            });

            // Break out of loop if we have a public key for each user
            if (filteredCircle.length + 1 !== convo.parties.length)
                await this.user.refreshDetails();
            else
                break;
        }

        // We do not know the public keys for each user in the convo and were unable to resolve them
        // filteredCircle length needs to be increased by 1 since we removed ourself from it earlier
        if (filteredCircle.length + 1 !== convo.parties.length)
            throw new Error("Circle does not contain all required keys");

        // Array of useable public keys
        const keys = filteredCircle.map(v => {
            // Load the public keys from the key string
            return {
                key: cryptico.publicKeyFromString(v.encryption.publicKey),
                id: v.id,
            };
        })

        // Add ourself to the filtered keys so we can decrypt our own message
        keys.push({
            key: cryptico.publicKeyFromString(this.user.encryption!.publicKey),
            id: this.user.id,
        });

        const factor = convo.parties.filter(v => v.userId == this.user.id)[0].factor;
        
        const msgObj = this.msgAuth.encryptMessage(textContent, keys, factor, this.user.id, convo.id);
        
        const decTest = this.msgAuth.decryptMessage(msgObj.message, msgObj.recipientKeys.filter(v => v.recipientId == this.user.id)[0], factor, this.user);

        if (sha256(textContent) !== sha256(decTest.plaintext))
            throw new Error("Secured message object contents does not match actual contents");

        const tun = await this.uplink.startSecureTunnel();

        const success = await tun.sendMessage(convo, msgObj);

        // Close this tunnel
        await tun.close();

        // TODO: Better error handling, make it look nicer

        if (!success)
            alert("Failed to send message, please try again later!")

        return success;
    }
}