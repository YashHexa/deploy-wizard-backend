import { Route53Client, ChangeResourceRecordSetsCommand } from "@aws-sdk/client-route-53";
import { getAwsCredentials } from "../config/env";

// AWS's fixed hosted zone id for CloudFront alias targets - the same for
// every distribution and every account.
const CLOUDFRONT_HOSTED_ZONE_ID = "Z2FDTNDATAQYW2";

function buildRoute53Client(): Route53Client {
  const credentials = getAwsCredentials();
  return new Route53Client({ region: "us-east-1", credentials });
}

export interface UpsertAliasRecordResult {
  changeId: string;
  status: string;
}

/**
 * Points recordName at the given CloudFront distribution using an alias A
 * record. UPSERT so re-running this for the same subdomain just repoints it.
 */
export async function upsertCloudFrontAliasRecord(
  hostedZoneId: string,
  recordName: string,
  cloudFrontDomainName: string
): Promise<UpsertAliasRecordResult> {
  const client = buildRoute53Client();

  const result = await client.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Comment: `Point ${recordName} at CloudFront distribution ${cloudFrontDomainName}`,
        Changes: [
          {
            Action: "UPSERT",
            ResourceRecordSet: {
              Name: recordName,
              Type: "A",
              AliasTarget: {
                HostedZoneId: CLOUDFRONT_HOSTED_ZONE_ID,
                DNSName: cloudFrontDomainName,
                EvaluateTargetHealth: false,
              },
            },
          },
        ],
      },
    })
  );

  const changeInfo = result.ChangeInfo;
  if (!changeInfo?.Id) {
    throw new Error("Route 53 did not return a change id.");
  }

  return {
    changeId: changeInfo.Id,
    status: changeInfo.Status ?? "PENDING",
  };
}
