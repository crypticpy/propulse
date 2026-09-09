import { Table } from "propulse";

export function EquipmentPorts() {
  return (
    <Table caption="Equipment ports">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Connector</th>
          <th scope="col">Direction</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>ANT 1</td>
          <td>SO-239</td>
          <td>RF out</td>
        </tr>
        <tr>
          <td>ANT 2</td>
          <td>SO-239</td>
          <td>RF out</td>
        </tr>
        <tr>
          <td>ACC</td>
          <td>13-pin DIN</td>
          <td>Control</td>
        </tr>
        <tr>
          <td>USB</td>
          <td>USB-B</td>
          <td>CAT and audio</td>
        </tr>
      </tbody>
    </Table>
  );
}

export function RecentContacts() {
  return (
    <Table caption="Recent contacts">
      <thead>
        <tr>
          <th scope="col">Time (UTC)</th>
          <th scope="col">Callsign</th>
          <th scope="col">Band</th>
          <th scope="col">Mode</th>
          <th scope="col">Report</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>14:02</td>
          <td>JA1XYZ</td>
          <td>20 m</td>
          <td>CW</td>
          <td>579</td>
        </tr>
        <tr>
          <td>13:48</td>
          <td>VK6LC</td>
          <td>15 m</td>
          <td>SSB</td>
          <td>57</td>
        </tr>
        <tr>
          <td>13:31</td>
          <td>DL2ABC</td>
          <td>40 m</td>
          <td>FT8</td>
          <td>-08</td>
        </tr>
      </tbody>
    </Table>
  );
}
