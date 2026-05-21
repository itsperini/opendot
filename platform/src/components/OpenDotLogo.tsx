const MARK_PATH =
  "M0 252C0 112.824 112.82 0 252 0 391.18 0 504 112.824 504 252 504 391.18 391.18 504 252 504 112.82 504 0 391.18 0 252ZM159.22 147.937C159.22 246.009 206.94 412.23 252 429.57 297.06 446.92 429.57 350.07 429.57 252 429.57 153.928 297.06 91.769 252 74.425 206.94 57.082 159.22 49.865 159.22 147.937Z";

type OpenDotLogoProps = {
  className?: string;
  title?: string;
};

export function OpenDotLogo({ className, title }: OpenDotLogoProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={className}
      fill="none"
      role={title ? "img" : undefined}
      viewBox="0 0 504 504"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <path d={MARK_PATH} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
