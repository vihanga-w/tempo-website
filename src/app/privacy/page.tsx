"use client";

import React, { useEffect, useState } from 'react';

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        maxWidth: '800px',
        margin: '0 auto',
        padding: '2rem',
        fontFamily: '"Helvetica Neue", sans-serif',
        color: '#fff',
        lineHeight: 1.6,
        overflow: "scroll",
        height: "100%",
        paddingBottom: "80px",
    },
    section: {
        marginTop: '2rem'
    },
    sectionTitle: {
        marginBottom: '0.5rem',
        fontSize: '1.5rem',
        borderBottom: '1px solid #ddd',
        paddingBottom: '0.3rem',
        fontWeight: "bold"
    }
};

type SectionProps = {
    number?: string;
    title: string;
    children: React.ReactNode;
};

const Section: React.FC<SectionProps> = ({ number, title, children }) => (
    <section style={styles.section}>
        <h2 style={styles.sectionTitle}>
            {number ? `${number}. ${title}` : title}
        </h2>
        {children}
    </section>
);

const PrivacyPolicy: React.FC = () => {
    const [isEmbed, setIsEmbed] = useState<boolean>(false);
    
    useEffect(() => {
        setIsEmbed(window.location.hash == "#embed");
    }, []);
    
    return (
        <div style={styles.container}>
            <h1 style={{
                fontSize: "28px",
                fontWeight: "bold",
                display: (isEmbed ? "none" : "block")
            }}>Tempo. Privacy Policy</h1>
            <p><strong>Effective Date:</strong> Tuesday 15th April 2025</p>
            <p><strong>Last Updated:</strong> Tuesday 25th August 2026</p>

            <br />

            <p>
                This Privacy Policy explains how <strong>Tempo.</strong> (“we”, “our”, or “us”) collects, uses, discloses and protects your personal data when you use the Tempo. mobile application (“App”). We are committed to protecting your privacy and complying with the UK General Data Protection Regulation (UK GDPR), the Data Protection Act 2018, and any other relevant data protection laws applicable in the United Kingdom.
            </p>

            <p>You may see us being referred to under the name of “Tempo Music”.</p>

            <p>By using Tempo., you acknowledge and agree to the practices described in this Privacy Policy.</p>

            {/* <hr /> */}

            <Section number="1" title="About Tempo.">
                <p>
                    Tempo. is a UK-based music app that allows users to connect their Spotify accounts and share their listening activity with friends they have added. The app is built on Spotify’s API.
                </p>
                <p>
                    Tempo. shares insights drawn from what you listen to — the track you are playing, your listening history, your streaks and your statistics. It does not host user-generated content: there is no messaging, no commenting and no posting between users, so there is nothing you write or upload for us to store or moderate.
                </p>
            </Section>

            <Section number="2" title="Information We Collect">
                <h3>From your Spotify account</h3>
                <p>When you connect your Spotify account, we receive and store:</p>
                <ul>
                    <li><strong>Spotify user ID</strong> – the unique identifier for your Spotify account, which is how we know a listening record is yours.</li>
                    <li><strong>Display name</strong> – your public Spotify name, used to identify you to your friends and in search.</li>
                    <li><strong>Email address</strong> – used so that friends who know your address can find you, and to contact you about your account.</li>
                    <li><strong>Profile picture</strong> – the image on your Spotify account. We keep a copy so it loads quickly, along with a small set of its average colours used to draw a placeholder while it loads.</li>
                    <li><strong>Access and refresh tokens</strong> – the credentials Spotify issues that let us read your listening activity on your behalf. These are held so that Tempo. can keep working without asking you to sign in repeatedly, and are revoked when you disconnect.</li>
                </ul>
                <p>We never receive or store your Spotify password. Authentication happens on Spotify’s own systems, and we only ever see the tokens it issues afterwards.</p>
                <p>
                    If you set Tempo. up using a Spotify application of your own, we also store that application’s <strong>client ID and client secret</strong>, because they are what your listening activity has to be requested with. They are used for no other purpose.
                </p>

                <h3>Your listening activity</h3>
                <p>This is the substance of what Tempo. does, and it comes from Spotify’s API rather than from anything you enter:</p>
                <ul>
                    <li>The track, episode or podcast you are currently playing, and how far through it you are</li>
                    <li>Your listening history, including tracks played while Tempo. was not open</li>
                    <li>Statistics derived from the above — listening streaks, totals, your most played music, and the times of day you typically listen</li>
                    <li>A taste profile built from that history, used to describe your listening back to you in recaps</li>
                </ul>
                <p>
                    We do not collect anything you write, record or upload, because there is nothing in Tempo. to write, record or upload.
                </p>

                <h3>Your friends and settings</h3>
                <ul>
                    <li><strong>Friend connections</strong> – who you have added, and requests sent or received.</li>
                    <li><strong>Your settings</strong> – including whether your profile is public, whether your listening activity is shared, and whether you appear in friend suggestions.</li>
                </ul>

                <h3>Notifications</h3>
                <p>
                    If you turn notifications on, we store what is needed to deliver them to that particular device: a push subscription in a browser, or a device token issued by Apple in the app. These identify the device, not you, and are deleted when the notification service tells us the device is no longer reachable.
                </p>

                <h3>Technical data</h3>
                <p>
                    Your <strong>IP address</strong> is used to limit how many requests a single source can make, which is what protects the service from abuse. For that purpose it is irreversibly hashed rather than stored. Unhashed addresses appear in our server logs alongside the requests made, which are retained only for a short period for security and debugging.
                </p>
                <p>
                    We do not use your IP address, or anything else, to determine your location. Tempo. does not collect or infer where you are.
                </p>
            </Section>

            <Section number="3" title="How We Use Your Data">
                <ul>
                    <li><strong>To sign you in and keep the app working</strong>, using the tokens Spotify issues to read your listening activity on your behalf.</li>
                    <li><strong>To show your listening activity to the friends you have added</strong>, if you have chosen to share it.</li>
                    <li><strong>To produce your statistics and recaps</strong> — streaks, totals, most played music and the summaries built from them.</li>
                    <li><strong>To decide how often to check what you are playing</strong>: we look at when you have typically listened before, so that we ask Spotify more often when you are likely to be listening and less often when you are not.</li>
                    <li><strong>To send you notifications</strong> you have asked for, such as a friend request or a recap being ready.</li>
                    <li><strong>To keep the service available</strong>, by limiting how many requests a single source can make and by investigating faults.</li>
                    <li><strong>To contact you</strong> about your account, including support requests and legal notices.</li>
                </ul>
                <p>
                    We do not profile you for advertising, and we do not sell or share your data with advertisers.
                </p>
            </Section>

            <Section number="4" title="Data Sharing and Sale">
                <p>We do not currently sell personal data. However, in the future we may enter into partnerships where <strong>anonymised and/or aggregated data</strong> is shared or sold to third parties.</p>
                <p>This data may include:</p>
                <ul>
                    <li>General listening trends and behaviour patterns</li>
                    <li>Reactions and sentiment analytics</li>
                    <li>Engagement metrics with artists or playlists</li>
                </ul>
                <p>
                    We will never sell individual user identities, contact information, or real-time playback data without explicit user consent.
                </p>
                <p>
                    Should we introduce any data sharing model, we will update this Privacy Policy and notify you in advance via the app or email.
                </p>
            </Section>

            <Section number="5" title="Legal Basis for Processing">
                <ul>
                    <li><strong>Contractual necessity</strong> – to enable you to access and use the app via your Spotify login.</li>
                    <li><strong>Legitimate interests</strong> – to analyse app usage and improve services.</li>
                    <li><strong>Consent</strong> – where applicable, such as for marketing communications or optional public visibility features.</li>
                </ul>
                <p>
                    If we rely on your consent for any processing activity, you have the right to withdraw that consent at any time.
                </p>
            </Section>

            <Section number="6" title="Children’s Privacy">
                <p>
                    Tempo. is not intended for children under the age of 13. We do not knowingly collect personal data from users under this age. If we discover that a user under 13 has registered, we will take appropriate steps to delete their data and account.
                </p>
                <p>
                    Users aged 13–17 may use the app, but we recommend they do so with the knowledge and permission of a parent or guardian. Certain features may be limited for under-18 users to comply with child safety regulations.
                </p>
            </Section>

            <Section number="7" title="Data Retention">
                <p>
                    We only retain your personal data for as long as necessary to fulfil the purposes for which it was collected, including legal, accounting, or reporting requirements.
                </p>
                <p>
                    Once your account is deleted, your personal data is removed or anonymised in accordance with our retention policy, unless we are required by law to retain it longer.
                </p>
            </Section>

            <Section number="8" title="Your Rights Under UK GDPR">
                <p>Under the UK GDPR, you have the following rights regarding your personal data:</p>
                <ul>
                    <li><strong>Right to access</strong> – You can request a copy of the personal data we hold about you.</li>
                    <li><strong>Right to rectification</strong> – You can request corrections to any inaccurate or incomplete information.</li>
                    <li><strong>Right to erasure</strong> – You can ask us to delete your data under certain conditions (“right to be forgotten”).</li>
                    <li><strong>Right to object</strong> – You may object to our use of your data for certain purposes.</li>
                    <li><strong>Right to restrict processing</strong> – You may ask us to suspend processing of your data under certain conditions.</li>
                    <li><strong>Right to data portability</strong> – You can request a copy of your data in a commonly used, machine-readable format.</li>
                </ul>
                <p>To exercise any of these rights, please contact us at <a href="mailto:tempo@vihangaw.xyz" style={{ color: "royalblue" }}>tempo@vihangaw.xyz</a>.</p>
            </Section>

            <Section number="9" title="Security Measures">
                <p>
                    We take the security of your personal data seriously. We use a combination of encryption, access control, secure authentication methods, and anonymisation strategies to protect your information. However, no system is entirely immune to risk, and we cannot guarantee absolute security.
                </p>
            </Section>

            <Section number="10" title="International Data Transfers">
                <p>
                    While Tempo. is based in the UK, some of our service providers may process data outside of the UK or EEA. In such cases, we ensure that appropriate safeguards are in place, such as Standard Contractual Clauses or other lawful transfer mechanisms approved under the UK GDPR.
                </p>
            </Section>

            <Section number="11" title="Changes to This Privacy Policy">
                <p>
                    We may update this Privacy Policy from time to time. If changes are significant, we will notify you via the app or by email before they take effect. The most current version will always be available within the app and on our website.
                </p>
                <p>
                    We encourage you to review this Privacy Policy regularly to stay informed of how we are protecting your data.
                </p>
            </Section>

            <Section number="12" title="Contact">
                <p>
                    If you have questions, concerns, or requests relating to your personal data or this Privacy Policy, you can contact us at:
                </p>
                <p><strong>Email:</strong> <a href="mailto:tempo@vihangaw.xyz" style={{ color: "royalblue" }}>tempo@vihangaw.xyz</a></p>
                <p>We aim to respond to all requests within 30 days.</p>
            </Section>

            <p>
                Tempo. is a product developed for music lovers, and we take your privacy as seriously as we do your listening experience. Thank you for trusting us.
            </p>
        </div>
    );
};

export default PrivacyPolicy;
