import { ACMClient, ListCertificatesCommand } from "@aws-sdk/client-acm";
import { getAwsCredentials } from "../config/env";

function buildAcmClient(): ACMClient {
  const credentials = getAwsCredentials();
  // CloudFront only accepts ACM certificates issued in us-east-1.
  return new ACMClient({ region: "us-east-1", credentials });
}

/**
 * Finds an issued ACM certificate (in us-east-1) whose domain name or
 * subject alternative names include the given domain, e.g. "*.hexacoder.co".
 */
export async function findCertificateArn(domain: string): Promise<string> {
  const client = buildAcmClient();
  let nextToken: string | undefined;

  do {
    const result = await client.send(
      new ListCertificatesCommand({
        CertificateStatuses: ["ISSUED"],
        NextToken: nextToken,
      })
    );

    const match = (result.CertificateSummaryList ?? []).find((cert) => {
      const names = [cert.DomainName, ...(cert.SubjectAlternativeNameSummaries ?? [])];
      return names.includes(domain);
    });

    if (match?.CertificateArn) {
      return match.CertificateArn;
    }

    nextToken = result.NextToken;
  } while (nextToken);

  throw new Error(
    `No issued ACM certificate found in us-east-1 covering "${domain}". Request or import one first.`
  );
}
