import { KinesisClient, PutRecordCommand } from "@aws-sdk/client-kinesis";
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";

async function sendRecords(streamName: string, records: string[]) {
  console.log(`Sending ${records.length} records to stream: ${streamName}`);
  const client = new KinesisClient();

  for (const record of records) {
    const command = new PutRecordCommand({
      StreamName: streamName,
      Data: Buffer.from(record),
      PartitionKey: "1",
    });
    await client.send(command);
    console.log(`Sent record: ${record}`);
  }
}

async function getStackOutputValue(stackName: string, key: string): Promise<string> {
  const cfnClient = new CloudFormationClient();
  const command = new DescribeStacksCommand({ StackName: stackName });
  const response = await cfnClient.send(command);

  const output = response.Stacks?.[0]?.Outputs?.find(
    (o) => o.OutputKey === key
  )?.OutputValue;
  if (!output) {
    throw new Error(`Output ${key} not found in stack ${stackName}`);
  }

  return output;
}

// Example records - you can modify these or pass them as command line arguments
const records = [
  `Whose woods these are I think I know.`,
  `His house is in the village though;`,
  `He will not see me stopping here`,
  `To watch his woods fill up with snow.`,
  `My little horse must think it queer`,
  `To stop without a farmhouse near`,
  `Between the woods and frozen lake`,
  `The darkest evening of the year.`,
  `He gives his harness bells a shake`,
  `To ask if there is some mistake.`,
  `The only other sound's the sweep`,
  `Of easy wind and downy flake.`,
  `The woods are lovely, dark and deep,`,
  `But I have promises to keep,`,
  `And miles to go before I sleep,`,
  `And miles to go before I sleep.`,
];

const streamName = await getStackOutputValue(
  "ReductionWordCountDemo",
  "SourceStreamName"
);
await sendRecords(streamName, records);
