import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      duration={2600}
      gap={8}
      offset={12}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "group toast !w-auto !max-w-[86vw] mx-auto !gap-2 !rounded-full !border !border-white/40 !bg-[hsl(0_0%_100%/0.6)] !px-3.5 !py-2 !text-[13px] !leading-snug !text-foreground !shadow-[0_10px_30px_-16px_rgba(16,46,38,0.35)] backdrop-blur-2xl saturate-150",
          title: "!text-[13px] !font-medium",
          description: "!text-[11px] group-[.toast]:text-muted-foreground",
          icon: "!h-4 !w-4 !mr-0",
          actionButton:
            "!h-7 !rounded-full !px-3 !text-[11px] group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "!h-7 !rounded-full !px-3 !text-[11px] group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
