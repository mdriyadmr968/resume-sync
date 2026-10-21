import type { Platform } from "@prisma/client";
import { PlatformAdapter } from "./base/PlatformAdapter";
import { PortfolioAdapter } from "./portfolio/PortfolioAdapter";
import { LinkedInAdapter } from "./linkedin/LinkedInAdapter";
import { BDJobsAdapter } from "./bdjobs/BDJobsAdapter";
import { CustomWebsiteAdapter } from "./custom/CustomWebsiteAdapter";

export function createPlatformAdapter(platform: Platform): PlatformAdapter {
  switch (platform.type) {
    case "portfolio":
      return new PortfolioAdapter(
        platform.id,
        platform.name,
        platform.configJson
      );
    case "linkedin":
      return new LinkedInAdapter(
        platform.id,
        platform.name,
        platform.configJson
      );
    case "bdjobs":
      return new BDJobsAdapter(
        platform.id,
        platform.name,
        platform.configJson
      );
    case "custom":
    default:
      return new CustomWebsiteAdapter(
        platform.id,
        platform.name,
        platform.configJson
      );
  }
}
