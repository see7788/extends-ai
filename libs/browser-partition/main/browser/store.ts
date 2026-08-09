import { z } from "zod";

const browserIdValidator = z.string().regex(/^[a-f0-9]{24}$/);
const browserApplicationValidator = z.object({
  executablePath: z.string().trim().min(1),
  launchArguments: z.array(z.string()),
  name: z.string().trim().min(1).max(120),
  sourcePath: z.string().trim().min(1).optional(),
});
const browserApplicationItemValidator = z.object({
  id: browserIdValidator,
  importSupported: z.boolean(),
  name: z.string().trim().min(1).max(120),
});
const browserApplicationsValidator = z.array(browserApplicationItemValidator);
const browserWindowHandlesValidator = z.object({
  handles: z.array(z.number().int().positive()),
});
const browserWindowCloseValidator = z.object({ closed: z.boolean() });
const commandValidator = z.object({});
const applicationReadValidator = z.object({ browserId: browserIdValidator });
const openValidator = applicationReadValidator.extend({ url: z.string().url() });
const browser = {
  browserApplicationValidator,
  browserApplicationsValidator,
  browserIdValidator,
  browserWindowCloseValidator,
  browserWindowHandlesValidator,
  channel: {
    applicationsRead: "browser-partition:browser:applications-read",
  },
  input: {
    applicationRead: applicationReadValidator,
    command: commandValidator,
    open: openValidator,
  },
};

export { browser };
export default browser;
