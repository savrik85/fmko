"use client";

import React from "react";
import { Sheet } from "./sheet";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
  title?: string;
}

/**
 * Zachované rozhraní nad <Sheet>.
 *
 * Původní Modal byl `div.modal-backdrop` + `div.modal-content` a neuměl
 * zavřít Escapem, nevracel zaměření a scrollování uvnitř protahovalo
 * i stránku pod ním. Volající kód se nemusel měnit — chování zdědí
 * všechny čtyři použití zdarma.
 */
export function Modal({ isOpen, onClose, children, maxWidth, title }: ModalProps) {
  return (
    <Sheet open={isOpen} onClose={onClose} maxWidth={maxWidth ?? "560px"} title={title}>
      {children}
    </Sheet>
  );
}
