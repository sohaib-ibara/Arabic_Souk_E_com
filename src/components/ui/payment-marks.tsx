/**
 * Accepted-payment marks for the footer.
 *
 * Drawn inline rather than shipped as image files: the strip sits on every page,
 * so six network requests for six tiny logos is a poor trade, and the site's
 * CSP allows no external asset hosts. Each mark is a fixed 40×26 chip — the
 * proportions of a card — so the row lines up whatever is in it.
 *
 * The brand marks belong to their owners and appear here only to say which
 * methods the store accepts, which is what they are for.
 */
type MarkProps = { className?: string };

const CHIP = "h-[26px] w-10 shrink-0 rounded-[4px]";

/** Shared frame: a card-shaped chip with a hairline edge. */
function Chip({
  title,
  fill = "#ffffff",
  children,
  className,
}: {
  title: string;
  fill?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 40 26"
      role="img"
      aria-label={title}
      className={`${CHIP} ${className ?? ""}`}
    >
      <title>{title}</title>
      <rect x="0.5" y="0.5" width="39" height="25" rx="3.5" fill={fill} stroke="#e2ddd6" />
      {children}
    </svg>
  );
}

export function VisaMark(p: MarkProps) {
  return (
    <Chip title="Visa" {...p}>
      {/* The wordmark's shape is the recognisable part: italic, tightly set. */}
      <text
        x="20"
        y="17.5"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="11"
        fontStyle="italic"
        fontWeight="700"
        letterSpacing="0.3"
        fill="#1a1f71"
      >
        VISA
      </text>
    </Chip>
  );
}

export function MastercardMark(p: MarkProps) {
  return (
    <Chip title="Mastercard" {...p}>
      <circle cx="16" cy="13" r="7" fill="#eb001b" />
      <circle cx="24" cy="13" r="7" fill="#f79e1b" />
      {/* The overlap reads orange on both brand sheets; drawn explicitly so it
          doesn't depend on blend-mode support. */}
      <path
        d="M20 7.7a7 7 0 0 0 0 10.6 7 7 0 0 0 0-10.6Z"
        fill="#ff5f00"
      />
    </Chip>
  );
}

export function AmexMark(p: MarkProps) {
  return (
    <Chip title="American Express" fill="#2e77bc" {...p}>
      <text
        x="20"
        y="16.5"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="8"
        fontWeight="700"
        letterSpacing="0.2"
        fill="#ffffff"
      >
        AMEX
      </text>
    </Chip>
  );
}

export function ApplePayMark(p: MarkProps) {
  return (
    <Chip title="Apple Pay" {...p}>
      {/* Apple glyph: leaf, then the notched body. */}
      <path
        d="M13.9 8.3c.5-.6.8-1.4.7-2.2-.7 0-1.6.5-2.1 1.1-.5.5-.9 1.4-.7 2.2.8.05 1.6-.4 2.1-1.1Z"
        fill="#000"
      />
      <path
        d="M14.6 9.6c-1.2-.07-2.2.66-2.7.66-.6 0-1.4-.63-2.3-.6-1.2.02-2.3.7-2.9 1.76-1.2 2.1-.3 5.3.9 7 .6.85 1.3 1.8 2.2 1.77.9-.04 1.2-.57 2.3-.57 1 0 1.3.57 2.3.55 1-.02 1.6-.86 2.2-1.72.7-1 1-1.94 1-2-.02-.02-1.9-.74-1.9-2.9-.02-1.8 1.5-2.67 1.5-2.72-.8-1.2-2.1-1.3-2.6-1.34Z"
        fill="#000"
      />
      <text
        x="26.5"
        y="17"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="9"
        fontWeight="500"
        fill="#000"
      >
        Pay
      </text>
    </Chip>
  );
}

/** Bahrain's domestic debit network — the card most local shoppers reach for. */
export function BenefitMark(p: MarkProps) {
  return (
    <Chip title="BENEFIT" fill="#0a4e9b" {...p}>
      <text
        x="20"
        y="16.5"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="7"
        fontWeight="700"
        letterSpacing="0.3"
        fill="#ffffff"
      >
        BENEFIT
      </text>
    </Chip>
  );
}

export function CashOnDeliveryMark(p: MarkProps) {
  return (
    <Chip title="Cash on delivery" {...p}>
      <rect x="8" y="8.5" width="24" height="12" rx="2" fill="#e8f3ec" stroke="#3f8f63" />
      <circle cx="20" cy="14.5" r="3.2" fill="none" stroke="#3f8f63" strokeWidth="1.2" />
      <path d="M11.5 11.5v6M28.5 11.5v6" stroke="#3f8f63" strokeWidth="1.2" strokeLinecap="round" />
    </Chip>
  );
}

/** The full strip, in the order a Bahraini shopper is most likely to use them. */
export function PaymentMarks({ className }: MarkProps) {
  return (
    <span className={`flex flex-wrap items-center gap-1.5 ${className ?? ""}`}>
      <VisaMark />
      <MastercardMark />
      <AmexMark />
      <BenefitMark />
      <ApplePayMark />
      <CashOnDeliveryMark />
    </span>
  );
}
