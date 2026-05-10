"use client";

import { useEffect, useState } from "react";

export const DEMO_TERMS_STORAGE_KEY = "truthmarket:demo-risk-accepted";
export const DEMO_TERMS_VERSION = "demo-risk-v1";

export function hasStoredDemoTermsAccepted() {
  try {
    return localStorage.getItem(DEMO_TERMS_STORAGE_KEY) === DEMO_TERMS_VERSION;
  } catch {
    return false;
  }
}

export function storeDemoTermsAccepted() {
  try {
    localStorage.setItem(DEMO_TERMS_STORAGE_KEY, DEMO_TERMS_VERSION);
  } catch {
    // Some browsers block storage. The in-memory acceptance still unlocks this session.
  }
}

export function DemoTermsGate() {
  const [hasAccepted, setHasAccepted] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setHasAccepted(hasStoredDemoTermsAccepted());
  }, []);

  useEffect(() => {
    document.body.classList.toggle("demo-terms-locked", !hasAccepted);
    return () => document.body.classList.remove("demo-terms-locked");
  }, [hasAccepted]);

  if (hasAccepted) return null;

  function accept() {
    storeDemoTermsAccepted();
    setHasAccepted(true);
    setChecked(false);
  }

  return (
    <div className="legal-backdrop">
      <section
        className="legal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legalTitle"
        aria-describedby="legalDescription"
      >
        <p className="eyebrow">Demo terms</p>
        <h2 id="legalTitle">TruthMarket demo risk notice</h2>
        <p id="legalDescription">
          This website is for demo purposes only. By entering, you accept and assume the risks of interacting with this demo.
        </p>
        <ul className="legal-list">
          <li>Any stake you commit, gas you pay, transaction you sign, missed reveal, selected-juror penalty, slashing, contract issue, network issue, wallet action, or other participation risk is solely your responsibility.</li>
          <li>No operator, maintainer, sponsor, teammate, or affiliated project party owes you compensation, reimbursement, make-good payment, indemnity, damages, payout, refund, replacement tokens, or similar remedy.</li>
          <li>Displayed markets, balances, rewards, and payout mechanics are demo interactions only. No return, reward, liquidity, resolution, continued availability, or value is promised.</li>
          <li>This is not legal, financial, investment, tax, staking, or wallet-safety advice. Use only funds you can afford to lose.</li>
        </ul>
        <label className="legal-check">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.currentTarget.checked)}
          />
          <span>I understand and accept these demo terms.</span>
        </label>
        <button
          className="primary-action legal-accept"
          type="button"
          disabled={!checked}
          onClick={accept}
        >
          Accept and enter demo
        </button>
      </section>
    </div>
  );
}
