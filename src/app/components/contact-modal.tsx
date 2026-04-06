"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

type FormState = "idle" | "sending" | "success" | "error";

const CONTACT_API = "https://contact.bini59.dev/api/contact";
const SERVICE_NAME = "trill-lab";

export function ContactButton() {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        className="contact-btn"
        onClick={handleOpen}
        type="button"
        aria-label="문의하기"
      >
        문의하기
      </button>
      {open && <ContactModal onClose={handleClose} />}
    </>
  );
}

function ContactModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const backdropRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormState("sending");
      setErrorMessage("");

      try {
        const res = await fetch(CONTACT_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service: SERVICE_NAME,
            name: name.trim(),
            email: email.trim(),
            message: message.trim(),
          }),
        });

        if (!res.ok) {
          throw new Error(`${res.status} ${res.statusText}`);
        }

        setFormState("success");
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "전송에 실패했습니다.",
        );
        setFormState("error");
      }
    },
    [name, email, message],
  );

  const isValid =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    message.trim().length > 0;

  return createPortal(
    <div
      className="contact-backdrop"
      ref={backdropRef}
      onClick={handleBackdropClick}
    >
      <div className="contact-modal" role="dialog" aria-label="문의하기">
        <div className="contact-modal-header">
          <strong>문의하기</strong>
          <button
            className="contact-modal-close"
            onClick={onClose}
            type="button"
            aria-label="닫기"
          >
            &times;
          </button>
        </div>

        {formState === "success" ? (
          <div className="contact-modal-body">
            <p className="contact-success-msg">
              문의가 전송되었습니다. 감사합니다!
            </p>
            <button className="contact-submit-btn" onClick={onClose} type="button">
              닫기
            </button>
          </div>
        ) : (
          <form className="contact-modal-body" onSubmit={handleSubmit}>
            <label className="contact-field">
              <span className="contact-label">이름</span>
              <input
                ref={nameInputRef}
                className="contact-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                required
                disabled={formState === "sending"}
              />
            </label>
            <label className="contact-field">
              <span className="contact-label">이메일</span>
              <input
                className="contact-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                required
                disabled={formState === "sending"}
              />
            </label>
            <label className="contact-field">
              <span className="contact-label">문의 내용</span>
              <textarea
                className="contact-input contact-textarea"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="문의 내용을 입력해주세요."
                rows={4}
                required
                disabled={formState === "sending"}
              />
            </label>
            {formState === "error" && (
              <p className="contact-error-msg">{errorMessage}</p>
            )}
            <button
              className="contact-submit-btn"
              type="submit"
              disabled={!isValid || formState === "sending"}
            >
              {formState === "sending" ? "전송 중..." : "보내기"}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
